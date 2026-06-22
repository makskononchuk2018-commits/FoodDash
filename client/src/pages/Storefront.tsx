import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Product } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShoppingCart, Plus, Minus, Trash2, X, Bot, Send,
  CreditCard, Banknote, Smartphone, ChevronRight, ChevronLeft,
  CheckCircle, Star, Clock, MapPin, LogIn, Gift, Tag, Zap,
  Truck, BadgePercent, Coins
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useCustomerSavedAddresses } from "@/hooks/use-customer";
import { useBonusBalance } from "@/hooks/use-bonuses";

// ── Константы доставки ──────────────────────────────────
const DELIVERY_FEE = 199;
const FREE_DELIVERY_FROM = 1500;
const BONUS_RATE = 0.02; // 2% бонусов от суммы заказа

type CartItem = { product: Product; quantity: number };
type PaymentMethod = "card" | "cash" | "sbp";
type CheckoutStep = "cart" | "info" | "payment" | "success";
interface ChatMessage { role: "user" | "assistant"; text: string; }
interface PromoResult { valid: boolean; discount: number; type: "percent" | "delivery" | "fixed"; label: string; }
type BonusOrderSummary = { spent: number; earned: number };

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: any; desc: string }[] = [
  { id: "card",  label: "Банковская карта",  icon: CreditCard,  desc: "Visa, MasterCard, МИР" },
  { id: "sbp",   label: "СБП",               icon: Smartphone,  desc: "Перевод по QR-коду, без комиссии" },
  { id: "cash",  label: "Наличные курьеру",  icon: Banknote,    desc: "Подготовьте точную сумму" },
];

function formatCardNumber(v: string) {
  return v.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
}
function formatExpiry(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length >= 3 ? d.slice(0, 2) + "/" + d.slice(2) : d;
}
function formatRub(n: number) {
  return n.toLocaleString("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function formatBonusPoints(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function extractApiErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const jsonStart = error.message.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(error.message.slice(jsonStart)) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message;
      }
    } catch {
      // Ignore invalid JSON in error payload.
    }
  }

  const compact = error.message.trim();
  return compact || fallback;
}

export default function Storefront() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const savedAddresses = useCustomerSavedAddresses(auth.data?.role === "customer");
  
  // Получаем реальный баланс бонусов с сервера
  const bonusData = useBonusBalance();
  const bonusBalance = bonusData.data ?? 0;

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [step, setStep] = useState<CheckoutStep>("cart");

  // Contact
  const [customerInfo, setCustomerInfo] = useState({ name: "", phone: "", address: "" });

  // Payment
  const [payMethod, setPayMethod] = useState<PaymentMethod>("card");
  const [cardNum, setCardNum]   = useState("");
  const [cardExp, setCardExp]   = useState("");
  const [cardCvv, setCardCvv]   = useState("");
  const [cardName, setCardName] = useState("");

  // Promo
  const [promoInput, setPromoInput]   = useState("");
  const [promo, setPromo]             = useState<PromoResult | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  // Bonuses
  const [useBonuses, setUseBonuses]   = useState(false);
  const [lastOrderBonusSummary, setLastOrderBonusSummary] = useState<BonusOrderSummary | null>(null);

  // AI chat
  const [isChatOpen, setIsChatOpen]   = useState(false);
  const [chatInput, setChatInput]     = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Привет! 👋 Я ИИ-помощник FoodDash. Подберу блюдо по вкусу, расскажу об акциях и доставке. Что хотите попробовать сегодня?" }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Filter & Pagination
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  const { data: products, isLoading } = useQuery<Product[]>({ queryKey: ["/api/products"] });

  // ── Категории и фильтрация ─────────────────────────
  const categories = products ? Array.from(new Set(products.map(p => p.category))).sort() : [];
  const filteredProducts = selectedCategory 
    ? products?.filter(p => p.category === selectedCategory) ?? []
    : products ?? [];
  
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory]);

  // ── Расчёты ─────────────────────────────────────────
  const subtotal = cart.reduce((s, i) => s + Number(i.product.price) * i.quantity, 0);
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);

  // Доставка
  const deliveryFree = subtotal >= FREE_DELIVERY_FROM || promo?.type === "delivery";
  const deliveryCost = deliveryFree ? 0 : DELIVERY_FEE;
  const freeDeliveryProgress = Math.min((subtotal / FREE_DELIVERY_FROM) * 100, 100);
  const missingForFree = Math.max(FREE_DELIVERY_FROM - subtotal, 0);

  // Скидка по промокоду
  const promoDiscount = promo
    ? promo.type === "percent" ? subtotal * (promo.discount / 100)
    : promo.type === "fixed"   ? Math.min(promo.discount, subtotal)
    : 0
    : 0;

  // Бонусные рубли
  const maxBonusApply = Math.min(bonusBalance, Math.floor(subtotal * 0.3)); // не более 30% суммы
  const bonusDiscount = useBonuses ? maxBonusApply : 0;

  // Итог
  const total = Math.max(subtotal - promoDiscount - bonusDiscount + deliveryCost, 0);
  // Бонусы начисляются на основную сумму заказа БЕЗ доставки
  const earnsBonuses = bonusDiscount <= 0;
  const earnedBonuses = earnsBonuses ? Math.floor(subtotal * BONUS_RATE) : 0;
  const successBonusSpent = lastOrderBonusSummary?.spent ?? bonusDiscount;
  const successBonusEarned = lastOrderBonusSummary?.earned ?? earnedBonuses;
  const successUsedBonuses = successBonusSpent > 0;

  // ── Мутации ─────────────────────────────────────────
  const createOrderMutation = useMutation({
    mutationFn: async (data: any) => (await apiRequest("POST", "/api/orders", data)).json(),
    onSuccess: (data) => {
      setLastOrderBonusSummary((current) => ({
        spent: data?.bonusSpent != null ? Number(data.bonusSpent) : current?.spent ?? 0,
        earned: data?.bonusEarned != null ? Number(data.bonusEarned) : current?.earned ?? 0,
      }));
      queryClient.invalidateQueries({ queryKey: ["/api/customer/bonuses/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/bonuses/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setStep("success");
    },
    onError: (error) => toast({
      title: "Ошибка",
      description: extractApiErrorMessage(error, "Не удалось оформить заказ. Попробуйте ещё раз."),
      variant: "destructive",
    }),
  });

  // Прокрутка чата
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatOpen]);

  // ── Корзина ─────────────────────────────────────────
  const addToCart = (product: Product) => {
    setCart(prev => {
      const ex = prev.find(i => i.product.id === product.id);
      if (ex) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1 }];
    });
    toast({ title: "Добавлено в корзину 🛒", description: product.name });
  };
  const removeFromCart = (id: number) => setCart(prev => prev.filter(i => i.product.id !== id));
  const updateQty = (id: number, delta: number) => setCart(prev => prev.map(i =>
    i.product.id !== id ? i : { ...i, quantity: Math.max(1, i.quantity + delta) }
  ));

  // ── Промокод ─────────────────────────────────────────
  const applyPromo = async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    try {
      const res = await apiRequest("POST", "/api/promo", { code: promoInput.trim().toUpperCase(), subtotal });
      const data = await res.json();
      if (data.valid) {
        setPromo(data);
        toast({ title: `Промокод применён! ${data.label}`, description: "Скидка учтена в итоговой сумме." });
      } else {
        setPromo(null);
        toast({ title: "Промокод не найден", description: data.message || "Проверьте правильность кода.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось проверить промокод.", variant: "destructive" });
    } finally {
      setPromoLoading(false);
    }
  };

  // ── Оформление заказа ──────────────────────────────
  const handleSubmitOrder = () => {
    if (!auth.data || auth.data.role !== "customer") {
      toast({
        title: "Требуется авторизация",
        description: "Оформление заказа доступно только после входа в аккаунт",
        variant: "destructive",
      });
      return;
    }

    setLastOrderBonusSummary({
      spent: bonusDiscount,
      earned: bonusDiscount > 0 ? 0 : Math.floor(subtotal * BONUS_RATE),
    });

    createOrderMutation.mutate({
      customerName: customerInfo.name.trim(),
      customerPhone: customerInfo.phone.trim(),
      customerAddress: customerInfo.address.trim(),
      channel: "website",
      items: cart.map(i => ({ productId: i.product.id, quantity: i.quantity })),
      useBonuses: bonusDiscount > 0,
    });
  };

  const moveToCheckoutInfo = () => {
    if (!auth.data || auth.data.role !== "customer") {
      toast({
        title: "Войдите в аккаунт",
        description: "Для оформления заказа нужна авторизация",
        variant: "destructive",
      });
      return;
    }

    const preferredAddress = savedAddresses.data?.find((item) => item.isDefault)?.address || savedAddresses.data?.[0]?.address;

    setCustomerInfo((prev) => ({
      ...prev,
      name: prev.name || auth.data?.fullName || "",
      phone: prev.phone || auth.data?.phone || "",
      address: prev.address || preferredAddress || "",
    }));

    setStep("info");
  };

  const resetCheckout = () => {
    setCart([]); setStep("cart");
    setCustomerInfo({ name: "", phone: "", address: "" });
    setCardNum(""); setCardExp(""); setCardCvv(""); setCardName("");
    setPromoInput(""); setPromo(null); setUseBonuses(false);
    setLastOrderBonusSummary(null);
    setSheetOpen(false);
  };

  const infoValid =
    customerInfo.name.trim().length >= 2 &&
    customerInfo.phone.trim().length >= 5 &&
    customerInfo.address.trim().length >= 5;
  const paymentValid =
    payMethod === "cash" || payMethod === "sbp" ||
    (payMethod === "card" &&
      cardNum.replace(/\s/g, "").length === 16 &&
      cardExp.length === 5 &&
      cardCvv.length === 3 &&
      cardName.trim().length > 0);

  // ── ИИ-помощник ──────────────────────────────────────
  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", text: msg }]);
    setChatLoading(true);
    try {
      const res = await apiRequest("POST", "/api/chat", { message: msg, products: products || [] });
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: "assistant", text: data.reply }]);
      if (data?.messengerOffer?.url) {
        const confirmed = window.confirm(data.messengerOffer.question || "Готовы перейти в Telegram?");
        if (confirmed) {
          window.open(data.messengerOffer.url, "_blank", "noopener,noreferrer");
        }
      }
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", text: "Извините, не смог ответить. Попробуйте ещё раз." }]);
    } finally {
      setChatLoading(false);
    }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto pb-24 px-4">

      {/* ─────────────── ШАПКА ─────────────── */}
      <header className="flex items-center justify-between sticky top-0 bg-gradient-to-r from-background/95 via-background/90 to-primary/5 backdrop-blur-xl z-20 py-5 border-b border-primary/10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-primary/30">FD</div>
          <div>
            <span className="text-2xl font-display font-bold bg-gradient-to-r from-primary to-orange-600 bg-clip-text text-transparent">FoodDash</span>
            <p className="text-xs text-muted-foreground">Еда с доставкой</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Бонусный баланс */}
          <div className="hidden sm:flex items-center gap-2 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 text-amber-900 px-4 py-2 rounded-full text-sm font-semibold shadow-sm hover:shadow-md transition-all">
            <Coins className="w-5 h-5 text-amber-600" />
            <span>{bonusBalance}</span>
            <span className="text-xs text-amber-700">бонусов</span>
          </div>

          {auth.data ? (
            <>
              <Button asChild variant="ghost" size="icon" className="rounded-full sm:hidden hover:bg-primary/10" aria-label="Открыть кабинет">
                <Link href={auth.data.role === "customer" ? "/profile" : auth.data.role === "admin" ? "/admin" : "/courier"}>
                  <LogIn className="w-5 h-5" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="rounded-full gap-2 hidden sm:flex hover:bg-primary/10">
                <Link href={auth.data.role === "customer" ? "/profile" : auth.data.role === "admin" ? "/admin" : "/courier"}>
                  <LogIn className="w-4 h-4" />
                  {auth.data.role === "customer" ? "Профиль" : "Кабинет"}
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="icon" className="rounded-full sm:hidden hover:bg-primary/10" aria-label="Войти">
                <Link href="/auth">
                  <LogIn className="w-5 h-5" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="rounded-full gap-2 hidden sm:flex hover:bg-primary/10">
                <Link href="/auth">
                  <LogIn className="w-4 h-4" /> Войти
                </Link>
              </Button>
            </>
          )}

          {/* ─── КОРЗИНА / ОФОРМЛЕНИЕ ─── */}
          <Sheet open={sheetOpen} onOpenChange={open => { setSheetOpen(open); if (!open) setStep("cart"); }}>
            <SheetTrigger asChild>
              <Button size="lg" className="relative h-11 px-5 rounded-full shadow-lg shadow-primary/20">
                <ShoppingCart className="mr-2 h-5 w-5" />
                <span className="hidden sm:inline">Корзина</span>
                {itemCount > 0 && (
                  <Badge variant="destructive" className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-xs min-w-[20px] text-center">
                    {itemCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>

            <SheetContent className="w-full sm:max-w-md flex flex-col p-0 overflow-hidden">

              {/* ── Корзина ── */}
              {step === "cart" && (
                <>
                  <SheetHeader className="px-6 pt-6 pb-4 border-b">
                    <SheetTitle className="text-2xl font-display">Ваш заказ</SheetTitle>
                  </SheetHeader>

                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                    {cart.length === 0 ? (
                      <div className="text-center py-16 text-muted-foreground">
                        <ShoppingCart className="h-14 w-14 mx-auto mb-4 opacity-20" />
                        <p className="font-medium">Корзина пуста</p>
                        <p className="text-sm mt-1">Добавьте блюда из меню</p>
                      </div>
                    ) : cart.map(item => (
                      <div key={item.product.id} className="flex gap-3 p-3 rounded-2xl border bg-card hover:border-primary/40 transition-colors">
                        <img src={item.product.imageUrl} alt={item.product.name} className="w-[72px] h-[72px] rounded-xl object-cover shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{item.product.name}</p>
                          <p className="text-sm text-primary font-bold mt-0.5">{formatRub(Number(item.product.price))}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => updateQty(item.product.id, -1)}><Minus className="h-3 w-3" /></Button>
                            <span className="text-sm font-bold w-5 text-center">{item.quantity}</span>
                            <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => updateQty(item.product.id, 1)}><Plus className="h-3 w-3" /></Button>
                          </div>
                        </div>
                        <div className="flex flex-col items-end justify-between">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => removeFromCart(item.product.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <span className="text-sm font-bold">{formatRub(Number(item.product.price) * item.quantity)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {cart.length > 0 && (
                    <div className="px-6 py-4 border-t space-y-4 bg-background">
                      {/* Прогресс до бесплатной доставки */}
                      {!deliveryFree && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> До бесплатной доставки</span>
                            <span className="font-semibold text-foreground">ещё {formatRub(missingForFree)}</span>
                          </div>
                          <Progress value={freeDeliveryProgress} className="h-2" />
                        </div>
                      )}
                      {deliveryFree && (
                        <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold bg-emerald-50 rounded-xl px-3 py-2">
                          <Truck className="w-4 h-4" /> Бесплатная доставка!
                        </div>
                      )}

                      {/* Промокод */}
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            className="rounded-xl h-10 pl-9 text-sm uppercase"
                            placeholder="Промокод"
                            value={promoInput}
                            onChange={e => setPromoInput(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === "Enter" && applyPromo()}
                          />
                        </div>
                        <Button variant="outline" className="rounded-xl h-10 px-4 text-sm" onClick={applyPromo} disabled={promoLoading || !promoInput.trim()}>
                          {promoLoading ? "..." : "Применить"}
                        </Button>
                      </div>
                      {promo && (
                        <div className="flex items-center gap-2 text-xs bg-primary/5 border border-primary/20 rounded-xl px-3 py-2 text-primary">
                          <BadgePercent className="w-4 h-4 shrink-0" /> {promo.label}
                          <button className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => { setPromo(null); setPromoInput(""); }}>
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Бонусы */}
                      {bonusBalance > 0 && (
                        <button
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${useBonuses ? "border-amber-400 bg-amber-50" : "border-muted hover:border-amber-300"}`}
                          onClick={() => setUseBonuses(v => !v)}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${useBonuses ? "bg-amber-400 text-white" : "bg-muted text-amber-500"}`}>
                            <Coins className="w-4 h-4" />
                          </div>
                          <div className="flex-1 text-sm">
                            <p className="font-semibold">Оплатить бонусами</p>
                            <p className="text-xs text-muted-foreground">Баланс: {Math.floor(bonusBalance)} бонусов = {formatRub(bonusBalance)}</p>
                          </div>
                          {useBonuses && <span className="text-xs font-bold text-amber-600">−{maxBonusApply} ₽</span>}
                        </button>
                      )}

                      {/* Итог */}
                      <div className="space-y-1.5 text-sm border-t pt-3">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Сумма заказа</span><span>{formatRub(subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Доставка</span>
                          <span className={deliveryFree ? "text-emerald-600 font-semibold" : ""}>{deliveryFree ? "Бесплатно" : formatRub(deliveryCost)}</span>
                        </div>
                        {promoDiscount > 0 && (
                          <div className="flex justify-between text-primary">
                            <span>Скидка ({promo?.label})</span><span>−{formatRub(promoDiscount)}</span>
                          </div>
                        )}
                        {bonusDiscount > 0 && (
                          <div className="flex justify-between text-amber-600">
                            <span>Бонусы</span><span>−{formatRub(bonusDiscount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-base border-t pt-2">
                          <span>Итого</span>
                          <span className="text-primary">{formatRub(total)}</span>
                        </div>
                        {earnsBonuses ? (
                          <p className="text-xs text-emerald-600 flex items-center gap-1">
                            <Gift className="w-3.5 h-3.5" /> За заказ начислится +{formatBonusPoints(earnedBonuses)} баллов
                          </p>
                        ) : (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <Coins className="w-3.5 h-3.5" /> Будет списано {formatBonusPoints(bonusDiscount)} баллов, новые баллы не начисляются
                          </p>
                        )}
                      </div>

                      <Button className="w-full h-[52px] text-base font-bold rounded-2xl shadow-lg shadow-primary/20" onClick={moveToCheckoutInfo}>
                        Оформить заказ <ChevronRight className="ml-2 h-5 w-5" />
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* ── Данные доставки ── */}
              {step === "info" && (
                <>
                  <SheetHeader className="px-6 pt-6 pb-4 border-b">
                    <div className="flex items-center gap-3">
                      <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => setStep("cart")}>
                        <ChevronLeft className="w-5 h-5" />
                      </Button>
                      <SheetTitle className="text-xl font-display">Данные доставки</SheetTitle>
                    </div>
                    <StepIndicator current={1} />
                  </SheetHeader>

                  <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    <div className="space-y-2">
                      <Label className="font-semibold">👤 ФИО</Label>
                      <Input className="rounded-xl h-12" placeholder="Иван Иванов" value={customerInfo.name} onChange={e => setCustomerInfo(p => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-semibold">📞 Телефон</Label>
                      <Input className="rounded-xl h-12" type="tel" placeholder="+7 (999) 000-00-00" value={customerInfo.phone} onChange={e => setCustomerInfo(p => ({ ...p, phone: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-semibold flex items-center gap-1"><MapPin className="w-4 h-4" /> Адрес доставки</Label>
                      <Textarea className="rounded-xl" rows={3} placeholder="Улица, дом, квартира, подъезд, этаж" value={customerInfo.address} onChange={e => setCustomerInfo(p => ({ ...p, address: e.target.value }))} />
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-muted/50 rounded-xl p-3 text-center">
                        <Clock className="w-5 h-5 mx-auto mb-1 text-primary" />
                        <p className="font-semibold">30–60 мин</p>
                        <p className="text-xs text-muted-foreground">Время доставки</p>
                      </div>
                      <div className="bg-muted/50 rounded-xl p-3 text-center">
                        <Truck className="w-5 h-5 mx-auto mb-1 text-primary" />
                        <p className="font-semibold">{deliveryFree ? "Бесплатно" : formatRub(deliveryCost)}</p>
                        <p className="text-xs text-muted-foreground">Доставка</p>
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-5 border-t">
                    <Button className="w-full h-[52px] text-base font-bold rounded-2xl shadow-lg shadow-primary/20" disabled={!infoValid} onClick={() => setStep("payment")}>
                      К оплате <ChevronRight className="ml-2 h-5 w-5" />
                    </Button>
                  </div>
                </>
              )}

              {/* ── Оплата ── */}
              {step === "payment" && (
                <>
                  <SheetHeader className="px-6 pt-6 pb-4 border-b">
                    <div className="flex items-center gap-3">
                      <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => setStep("info")}>
                        <ChevronLeft className="w-5 h-5" />
                      </Button>
                      <SheetTitle className="text-xl font-display">Способ оплаты</SheetTitle>
                    </div>
                    <StepIndicator current={2} />
                  </SheetHeader>

                  <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    {/* Выбор способа */}
                    <div className="space-y-2.5">
                      {PAYMENT_METHODS.map(m => (
                        <button key={m.id} onClick={() => setPayMethod(m.id)}
                          className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${payMethod === m.id ? "border-primary bg-primary/5" : "border-muted hover:border-primary/30"}`}>
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${payMethod === m.id ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                            <m.icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-sm">{m.label}</p>
                            <p className="text-xs text-muted-foreground">{m.desc}</p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${payMethod === m.id ? "border-primary" : "border-muted-foreground/30"}`}>
                            {payMethod === m.id && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Детали оплаты */}
                    <AnimatePresence mode="wait">
                      {payMethod === "card" && (
                        <motion.div key="card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                          <div className="bg-gradient-to-br from-primary to-orange-500 rounded-2xl p-5 text-white space-y-4">
                            <div className="flex justify-between items-start">
                              <CreditCard className="w-8 h-8 opacity-80" />
                              <span className="text-xs opacity-70 font-mono">FOODDASH PAY</span>
                            </div>
                            <p className="font-mono text-lg tracking-widest">{cardNum || "0000 0000 0000 0000"}</p>
                            <div className="flex justify-between">
                              <div><p className="text-xs opacity-60">ВЛАДЕЛЕЦ</p><p className="text-sm font-semibold uppercase">{cardName || "ВАШЕ ИМЯ"}</p></div>
                              <div><p className="text-xs opacity-60">СРОК</p><p className="text-sm font-semibold">{cardExp || "ММ/ГГ"}</p></div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-muted-foreground">Номер карты</Label>
                            <Input className="rounded-xl h-11 font-mono" placeholder="0000 0000 0000 0000" value={cardNum} onChange={e => setCardNum(formatCardNumber(e.target.value))} maxLength={19} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-muted-foreground">Имя на карте</Label>
                            <Input className="rounded-xl h-11 uppercase" placeholder="IVAN IVANOV" value={cardName} onChange={e => setCardName(e.target.value.toUpperCase())} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-muted-foreground">Срок (ММ/ГГ)</Label>
                              <Input className="rounded-xl h-11 font-mono" placeholder="ММ/ГГ" value={cardExp} onChange={e => setCardExp(formatExpiry(e.target.value))} maxLength={5} />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-muted-foreground">CVV/CVC</Label>
                              <Input className="rounded-xl h-11 font-mono" placeholder="•••" type="password" maxLength={3} value={cardCvv} onChange={e => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 3))} />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">🔒 Данные карты защищены и не сохраняются</p>
                        </motion.div>
                      )}
                      {payMethod === "sbp" && (
                        <motion.div key="sbp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-muted/50 rounded-2xl p-5 text-center space-y-3">
                          <div className="w-32 h-32 bg-white border-2 rounded-2xl mx-auto flex items-center justify-center text-5xl">📱</div>
                          <p className="text-sm font-medium">QR-код для оплаты придёт в СМС</p>
                          <p className="text-xs text-muted-foreground">Мгновенная оплата без комиссии через СБП</p>
                        </motion.div>
                      )}
                      {payMethod === "cash" && (
                        <motion.div key="cash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-muted/50 rounded-2xl p-5 space-y-2">
                          <p className="font-semibold flex items-center gap-2"><Banknote className="w-5 h-5 text-primary" /> Подготовьте сумму</p>
                          <p className="text-3xl font-bold text-primary">{formatRub(total)}</p>
                          <p className="text-xs text-muted-foreground">Курьер не всегда имеет сдачу. Пожалуйста, подготовьте точную сумму.</p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Состав заказа */}
                    <div className="border rounded-2xl p-4 space-y-2 text-sm">
                      <p className="font-bold text-base mb-2">Состав заказа</p>
                      {cart.map(i => (
                        <div key={i.product.id} className="flex justify-between text-muted-foreground">
                          <span>{i.product.name} × {i.quantity}</span>
                          <span>{formatRub(Number(i.product.price) * i.quantity)}</span>
                        </div>
                      ))}
                      <div className="border-t pt-2 space-y-1">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Доставка</span>
                          <span className={deliveryFree ? "text-emerald-600" : ""}>{deliveryFree ? "Бесплатно" : formatRub(deliveryCost)}</span>
                        </div>
                        {promoDiscount > 0 && <div className="flex justify-between text-primary"><span>Промокод</span><span>−{formatRub(promoDiscount)}</span></div>}
                        {bonusDiscount > 0 && <div className="flex justify-between text-amber-600"><span>Бонусы</span><span>−{formatRub(bonusDiscount)}</span></div>}
                        <div className="flex justify-between font-bold text-base"><span>К оплате</span><span className="text-primary">{formatRub(total)}</span></div>
                      </div>
                      {earnsBonuses ? (
                        <p className="text-xs text-emerald-600 flex items-center gap-1 pt-1">
                          <Gift className="w-3.5 h-3.5" /> За заказ начислится +{formatBonusPoints(earnedBonuses)} баллов
                        </p>
                      ) : (
                        <p className="text-xs text-amber-600 flex items-center gap-1 pt-1">
                          <Coins className="w-3.5 h-3.5" /> Будет списано {formatBonusPoints(bonusDiscount)} баллов, новые баллы не начисляются
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="px-6 py-5 border-t">
                    <Button
                      className="w-full h-[52px] text-base font-bold rounded-2xl shadow-lg shadow-primary/20"
                      disabled={!paymentValid || createOrderMutation.isPending}
                      onClick={handleSubmitOrder}
                    >
                      {createOrderMutation.isPending
                        ? <span className="flex items-center gap-2"><div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />Обработка...</span>
                        : <>Оплатить {formatRub(total)}</>
                      }
                    </Button>
                  </div>
                </>
              )}

              {/* ── Успех ── */}
              {step === "success" && (
                <div className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-5">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}>
                    <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-14 h-14 text-emerald-500" />
                    </div>
                  </motion.div>
                  <div>
                    <h2 className="text-2xl font-display font-bold">Заказ оформлен! 🎉</h2>
                    <p className="text-muted-foreground text-sm mt-2">Уже готовится. Курьер позвонит за 10 минут до прибытия.</p>
                  </div>
                  <div className="bg-muted/50 rounded-2xl p-4 w-full space-y-2 text-sm text-left">
                    <div className="flex justify-between"><span className="text-muted-foreground">Адрес</span><span className="font-medium text-right max-w-[60%]">{customerInfo.address}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Оплата</span><span className="font-medium">{PAYMENT_METHODS.find(m => m.id === payMethod)?.label}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Сумма</span><span className="font-bold text-primary">{formatRub(total)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Время</span><span className="font-medium">30–60 минут</span></div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 w-full flex items-center gap-3">
                    <Coins className="w-8 h-8 text-amber-500 shrink-0" />
                    <div className="text-left">
                      {!successUsedBonuses ? (
                        <>
                          <p className="font-bold text-amber-700">+{formatBonusPoints(successBonusEarned)} баллов начислится</p>
                          <p className="text-xs text-amber-600">Их можно будет использовать в следующем заказе</p>
                        </>
                      ) : (
                        <>
                          <p className="font-bold text-amber-700">Списано {formatBonusPoints(successBonusSpent)} баллов</p>
                          <p className="text-xs text-amber-600">За этот заказ новые баллы не начисляются</p>
                        </>
                      )}
                    </div>
                  </div>
                  <Button className="w-full h-[52px] text-base font-bold rounded-2xl" onClick={resetCheckout}>
                    Закрыть
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* ─────────────── АКЦИИ-БАННЕР ─────────────── */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: "🚚", title: "Бесплатная доставка", desc: `от ${formatRub(FREE_DELIVERY_FROM)}`, color: "from-blue-50 via-blue-50 to-cyan-100 border-blue-300", icon_bg: "bg-blue-100" },
          { icon: "🎁", title: "Скидка -15%", desc: "промокод НОВИНКА", color: "from-primary/10 via-orange-50 to-amber-100 border-primary/30", icon_bg: "bg-primary/10" },
          { icon: "⭐", title: "Бонусная программа", desc: "2% с каждого заказа", color: "from-amber-50 via-yellow-50 to-orange-100 border-amber-300", icon_bg: "bg-amber-100" },
        ].map(b => (
          <div key={b.title} className={`flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r border shadow-sm hover:shadow-md transition-all ${b.color}`}>
            <div className={`${b.icon_bg} p-3 rounded-xl text-2xl w-14 h-14 flex items-center justify-center`}>{b.icon}</div>
            <div className="flex-1">
              <p className="font-bold text-sm text-foreground">{b.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{b.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ─────────────── ГЕРОЙ ─────────────── */}
      <section className="py-16 md:py-24 text-center space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-bold tracking-tight">
            <span className="bg-gradient-to-r from-primary via-orange-500 to-red-500 bg-clip-text text-transparent">Вкусная еда за 30 минут</span>
          </h1>
        </motion.div>
        <motion.p 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.2 }} 
          className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
        >
          Свежие ингредиенты, опытные повара и аккуратная упаковка. 
          <br className="hidden md:block" />
          Закажите прямо сейчас и получите бонусы!
        </motion.p>
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.4 }} 
          className="flex flex-wrap justify-center gap-6 text-sm font-medium"
        >
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full text-blue-700 border border-blue-200">
            <Clock className="w-5 h-5" /> 30–60 минут
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 rounded-full text-yellow-700 border border-yellow-200">
            <Star className="w-5 h-5" /> Рейтинг 4.9 / 5
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-full text-green-700 border border-green-200">
            <Truck className="w-5 h-5" /> Бесплатно от 1500₽
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 rounded-full text-purple-700 border border-purple-200">
            <Zap className="w-5 h-5" /> Работаем 24/7
          </div>
        </motion.div>
      </section>

      {/* ─────────────── КАТАЛОГ ─────────────── */}
      <section className="space-y-8">
        {/* Фильтр по категориям */}
        {categories.length > 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-display font-bold text-foreground">Категории меню</h2>
              <p className="text-sm text-muted-foreground">Выберите то, что вам нравится</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === null ? "default" : "outline"}
                size="sm"
                className={`rounded-full transition-all ${selectedCategory === null ? "shadow-lg shadow-primary/30" : "hover:border-primary/50"}`}
                onClick={() => setSelectedCategory(null)}
              >
                <span className="font-semibold">Все блюда</span>
                <span className="ml-2 text-xs opacity-70">({products?.length ?? 0})</span>
              </Button>
              {categories.map(cat => {
                const count = products?.filter(p => p.category === cat).length ?? 0;
                const isSelected = selectedCategory === cat;
                return (
                  <Button
                    key={cat}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className={`rounded-full transition-all ${isSelected ? "shadow-lg shadow-primary/30" : "hover:border-primary/50 hover:bg-primary/5"}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    <span>{cat}</span>
                    <span className="ml-1.5 px-1.5 py-0.5 bg-white/30 rounded text-xs font-bold">{count}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* Сетка товаров */}
        <div className="space-y-4">
          <h2 className="text-lg font-display font-bold text-foreground">Наше меню</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedProducts.map(product => (
              <div key={product.id} className="product-card group">
                <Card className="overflow-hidden hover:shadow-2xl transition-all duration-300 border-primary/10 bg-white rounded-3xl h-full flex flex-col shadow-sm hover:shadow-primary/20">
                  <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-secondary/50 to-secondary/20">
                    <img src={product.imageUrl} alt={product.name} className="product-image w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                    
                    {/* Overlay with description */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-end justify-between p-6">
                      <div className="w-full text-white">
                        <p className="text-sm font-medium line-clamp-2">{product.description}</p>
                      </div>
                    </div>
                    
                    {/* Badges */}
                    <div className="absolute top-3 left-3 flex gap-2">
                      <Badge className="bg-primary/90 text-white border-none px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                        {product.category}
                      </Badge>
                    </div>
                    
                    {/* Stock warning */}
                    {Number(product.stock) <= 10 && (
                      <Badge className="absolute top-3 right-3 bg-red-500/90 text-white border-none px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                        Осталось {product.stock}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Content */}
                  <CardHeader className="p-5 pb-3 flex-1">
                    <div className="space-y-2">
                      <CardTitle className="text-lg font-display font-bold leading-tight group-hover:text-primary transition-colors">
                        {product.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {product.description}
                      </p>
                    </div>
                  </CardHeader>
                  
                  {/* Footer with price and button */}
                  <CardFooter className="p-5 pt-3 flex flex-col gap-3">
                    <div className="w-full flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-display font-bold text-primary">
                          {formatRub(Number(product.price))}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg">
                        <Coins className="w-3.5 h-3.5" />
                        +{Math.floor(Number(product.price) * BONUS_RATE)}
                      </div>
                    </div>
                    <Button 
                      onClick={() => addToCart(product)}
                      className="w-full h-11 rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all active:scale-95 font-bold"
                    >
                      <Plus className="mr-2 h-4 w-4" /> В корзину
                    </Button>
              </CardFooter>
            </Card>
          </div>
          ))}
        </div>
      </div> 

        {/* Пагинация */}
        {totalPages > 1 && (
          <div className="flex flex-col items-center justify-center gap-4 mt-12 pb-12">
            <div className="text-sm text-muted-foreground font-medium">
              Страница <span className="text-primary font-bold">{currentPage}</span> из <span className="font-bold">{totalPages}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="rounded-lg hover:bg-primary/10 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Назад
              </Button>
              <div className="flex items-center gap-1 px-4">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className={`rounded-lg min-w-10 h-10 transition-all ${currentPage === page ? "shadow-lg shadow-primary/30 scale-110" : "hover:bg-muted"}`}
                  >
                    {page}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="rounded-lg hover:bg-primary/10 disabled:opacity-50"
              >
                Далее <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Пусто */}
        {paginatedProducts.length === 0 && (
          <div className="text-center py-16">
            <ShoppingCart className="h-14 w-14 mx-auto mb-4 opacity-20" />
            <p className="font-medium text-muted-foreground">Товаров не найдено</p>
            <p className="text-sm text-muted-foreground mt-1">Попробуйте выбрать другую категорию</p>
          </div>
        )}
      </section>

      {/* ─────────────── ИИ-ПОМОЩНИК ─────────────── */}
      <div className="fixed bottom-8 right-6 z-50 flex flex-col items-end gap-3">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border flex flex-col overflow-hidden"
              style={{ height: 480 }}
            >
              <div className="flex items-center gap-3 px-5 py-4 bg-primary text-white shrink-0">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm">ИИ-помощник FoodDash</p>
                  <p className="text-xs text-white/70 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block" />
                    Онлайн • Ответ за секунды
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8" onClick={() => setIsChatOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mr-2 shrink-0 mt-1">
                        <Bot className="w-3.5 h-3.5 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                      m.role === "user" ? "bg-primary text-white rounded-tr-none" : "bg-muted text-foreground rounded-tl-none"
                    }`}>
                      {m.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="bg-muted px-4 py-3 rounded-2xl rounded-tl-none">
                      <div className="flex gap-1">
                        {[0, 150, 300].map(d => (
                          <span key={d} className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="px-4 pb-2 flex gap-2 flex-wrap shrink-0">
                {["Что дешевле?", "Акции", "Доставка", "Рекомендуй!"].map(q => (
                  <button key={q} className="text-xs px-3 py-1 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50" onClick={async () => {
                    setChatInput("");
                    setChatMessages(prev => [...prev, { role: "user", text: q }]);
                    setChatLoading(true);
                    try {
                      const res = await apiRequest("POST", "/api/chat", { message: q, products: products || [] });
                      const data = await res.json();
                      setChatMessages(prev => [...prev, { role: "assistant", text: data.reply }]);
                    } catch {
                      setChatMessages(prev => [...prev, { role: "assistant", text: "Извините, не смог ответить. Попробуйте ещё раз." }]);
                    } finally {
                      setChatLoading(false);
                    }
                  }} disabled={chatLoading}>
                    {q}
                  </button>
                ))}
              </div>

              <div className="p-4 border-t flex gap-2 shrink-0">
                <Input
                  className="rounded-xl h-10 text-sm"
                  placeholder="Спросите о меню, акциях..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendChat()}
                  disabled={chatLoading}
                />
                <Button size="icon" className="rounded-xl h-10 w-10 shrink-0" onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          size="icon"
          className="w-14 h-14 rounded-full shadow-2xl bg-primary hover:scale-110 transition-transform relative"
          onClick={() => setIsChatOpen(v => !v)}
        >
          <Bot className="w-7 h-7" />
          {!isChatOpen && <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white" />}
        </Button>
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: number }) {
  const steps = ["Данные", "Оплата"];
  return (
    <div className="flex items-center gap-2 mt-3">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2 flex-1">
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${i + 1 <= current ? "text-primary" : "text-muted-foreground"}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${i + 1 <= current ? "bg-primary text-white" : "bg-muted"}`}>{i + 1}</div>
            {label}
          </div>
          {i < steps.length - 1 && <div className={`flex-1 h-0.5 ${i + 1 < current ? "bg-primary" : "bg-muted"}`} />}
        </div>
      ))}
    </div>
  );
}
