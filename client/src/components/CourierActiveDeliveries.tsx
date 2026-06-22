import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
  MapPin,
  Phone,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  type CourierDeliveryWithItems,
  useAcceptDelivery,
  useActiveDeliveries,
  useAvailableCourierOrders,
  useCancelDelivery,
  useRemoveOrderItem,
  useUpdateDeliverySequence,
  useUpdateDeliveryStatus,
} from "@/hooks/use-courier-delivery";
import { CourierLocationTracker } from "@/components/CourierLocationTracker";

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  pending: "Ожидает забора",
  picked_up: "У курьера",
  delivered: "Доставлен",
  cancelled: "Отменен",
};

const SEQUENCE_LABEL: Record<number, string> = {
  1: "Первым",
  2: "Вторым",
  3: "Третьим",
};

const REMOVE_REASONS = [
  { key: "defect", label: "Брак или повреждение" },
  { key: "missing", label: "Товар отсутствует" },
  { key: "wrong_item", label: "Не тот товар" },
  { key: "other", label: "Другая причина" },
];

const COURIER_CANCEL_REASONS = [
  { key: "customer_unreachable", label: "Клиент не выходит на связь" },
  { key: "customer_refused", label: "Клиент отказался" },
  { key: "address_not_found", label: "Не удалось найти адрес" },
  { key: "vehicle_issue", label: "Проблема с транспортом" },
  { key: "other", label: "Другая причина" },
];

type RemoveDialogState = {
  deliveryId: number;
  itemId: number;
  itemName: string;
} | null;

type CancelDialogState = {
  deliveryId: number;
  orderId: number;
} | null;

export function CourierActiveDeliveries() {
  const { toast } = useToast();
  const activeDeliveries = useActiveDeliveries();
  const availableOrders = useAvailableCourierOrders();
  const acceptDelivery = useAcceptDelivery();
  const updateSequence = useUpdateDeliverySequence();
  const updateStatus = useUpdateDeliveryStatus();
  const removeItem = useRemoveOrderItem();
  const cancelDelivery = useCancelDelivery();

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [removeDialog, setRemoveDialog] = useState<RemoveDialogState>(null);
  const [removeReasonKey, setRemoveReasonKey] = useState("defect");
  const [removeDetails, setRemoveDetails] = useState("");
  const [cancelDialog, setCancelDialog] = useState<CancelDialogState>(null);
  const [cancelReasonKey, setCancelReasonKey] = useState("customer_unreachable");
  const [cancelDetails, setCancelDetails] = useState("");

  const deliveries = useMemo(() => {
    return [...(activeDeliveries.data || [])].sort((a, b) => a.deliverySequence - b.deliverySequence);
  }, [activeDeliveries.data]);

  const canAcceptMore = deliveries.length < 3;
  const firstDeliveryId = deliveries[0]?.id;

  const toggleExpanded = (deliveryId: number) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(deliveryId)) {
        next.delete(deliveryId);
      } else {
        next.add(deliveryId);
      }
      return next;
    });
  };

  const handleAccept = async (orderId: number) => {
    try {
      await acceptDelivery.mutateAsync(orderId);
      toast({ title: "Заказ добавлен в доставку" });
    } catch (error) {
      toast({
        title: "Не удалось взять заказ",
        description: error instanceof Error ? error.message : "Попробуйте еще раз",
        variant: "destructive",
      });
    }
  };

  const handleStatus = async (deliveryId: number, status: "picked_up" | "delivered") => {
    try {
      await updateStatus.mutateAsync({ id: deliveryId, status });
      toast({ title: status === "picked_up" ? "Заказ отмечен как забранный" : "Заказ доставлен" });
    } catch (error) {
      toast({
        title: "Не удалось обновить доставку",
        description: error instanceof Error ? error.message : "Попробуйте еще раз",
        variant: "destructive",
      });
    }
  };

  const handleMoveDelivery = async (deliveryId: number, newSequence: number) => {
    try {
      await updateSequence.mutateAsync({ id: deliveryId, newSequence });
      toast({ title: "Порядок доставок обновлен" });
    } catch (error) {
      toast({
        title: "Не удалось изменить порядок",
        description: error instanceof Error ? error.message : "Попробуйте еще раз",
        variant: "destructive",
      });
    }
  };

  const handleRemoveItem = async () => {
    if (!removeDialog) return;

    try {
      await removeItem.mutateAsync({
        deliveryId: removeDialog.deliveryId,
        itemId: removeDialog.itemId,
        reasonKey: removeReasonKey,
        reasonDetails: removeDetails.trim(),
      });
      toast({ title: "Товар удален из заказа" });
      setRemoveDialog(null);
      setRemoveReasonKey("defect");
      setRemoveDetails("");
    } catch (error) {
      toast({
        title: "Не удалось удалить товар",
        description: error instanceof Error ? error.message : "Попробуйте еще раз",
        variant: "destructive",
      });
    }
  };

  const handleCancelDelivery = async () => {
    if (!cancelDialog) return;

    try {
      await cancelDelivery.mutateAsync({
        id: cancelDialog.deliveryId,
        reasonKey: cancelReasonKey,
        reasonDetails: cancelDetails.trim(),
      });
      toast({ title: "Заказ отменен" });
      setCancelDialog(null);
      setCancelReasonKey("customer_unreachable");
      setCancelDetails("");
    } catch (error) {
      toast({
        title: "Не удалось отменить заказ",
        description: error instanceof Error ? error.message : "Попробуйте еще раз",
        variant: "destructive",
      });
    }
  };

  const renderDelivery = (delivery: CourierDeliveryWithItems) => {
    const isFirst = delivery.id === firstDeliveryId;
    const isExpanded = isFirst || expandedIds.has(delivery.id);
    const order = delivery.order;

    return (
      <div
        key={delivery.id}
        className={`rounded-xl border bg-card transition-shadow ${isFirst ? "border-primary shadow-sm" : "border-border"}`}
      >
        <button
          type="button"
          className="w-full p-4 text-left"
          onClick={() => !isFirst && toggleExpanded(delivery.id)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-primary text-white">
                  {SEQUENCE_LABEL[delivery.deliverySequence] || `${delivery.deliverySequence}-й`}
                </Badge>
                <Badge variant="outline">{DELIVERY_STATUS_LABEL[delivery.status] || delivery.status}</Badge>
                {isFirst && <Badge variant="secondary">Текущая доставка</Badge>}
              </div>
              <p className="font-semibold">Заказ #{delivery.orderId}</p>
              <p className="text-sm text-muted-foreground flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{delivery.deliveryAddress}</span>
              </p>
              <p className="text-sm text-muted-foreground">Клиент: {order.customerName}</p>
            </div>
            {!isFirst && (
              <span className="rounded-lg border p-1">
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            )}
          </div>
        </button>

        {isExpanded && (
          <div className="space-y-4 border-t bg-muted/20 p-4">
            {isFirst && <CourierLocationTracker orderId={delivery.orderId} isActive />}

            <div className="grid grid-cols-2 gap-2">
              <Button asChild className="h-10 rounded-lg">
                <a href={`tel:${order.customerPhone}`}>
                  <Phone className="mr-2 h-4 w-4" />
                  Позвонить
                </a>
              </Button>
              <Button asChild variant="outline" className="h-10 rounded-lg">
                <a
                  href={`https://yandex.com/maps/?text=${encodeURIComponent(delivery.deliveryAddress)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin className="mr-2 h-4 w-4" />
                  Маршрут
                </a>
              </Button>
            </div>

            {deliveries.length > 1 && delivery.status === "pending" && (
              <div className="flex items-center gap-2 rounded-lg border bg-white p-3">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Позиция</span>
                <Select
                  value={String(delivery.deliverySequence)}
                  onValueChange={(value) =>
                    handleMoveDelivery(delivery.id, Number(value))
                  }
                >
                  <SelectTrigger className="ml-auto h-9 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {deliveries.map((_, index) => (
                      <SelectItem key={index + 1} value={String(index + 1)}>
                        {index + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => handleMoveDelivery(delivery.id, delivery.deliverySequence - 1)}
                  disabled={delivery.deliverySequence <= 1 || updateSequence.isPending}
                  title="Поднять доставку"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => handleMoveDelivery(delivery.id, delivery.deliverySequence + 1)}
                  disabled={delivery.deliverySequence >= deliveries.length || updateSequence.isPending}
                  title="Опустить доставку"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-semibold">Состав заказа</p>
              {delivery.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.product?.name || `Товар #${item.productId}`}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} шт. · {Number(item.price).toFixed(0)} ₽
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() =>
                      setRemoveDialog({
                        deliveryId: delivery.id,
                        itemId: item.id,
                        itemName: item.product?.name || `Товар #${item.productId}`,
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="rounded-lg border bg-white p-3 text-sm">
              Сумма заказа: <span className="font-semibold">{Number(order.totalAmount).toFixed(0)} ₽</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {delivery.status === "pending" ? (
                <Button
                  className="h-10 rounded-lg"
                  onClick={() => handleStatus(delivery.id, "picked_up")}
                  disabled={updateStatus.isPending}
                >
                  <Truck className="mr-2 h-4 w-4" />
                  Забрал
                </Button>
              ) : (
                <Button
                  className="h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => handleStatus(delivery.id, "delivered")}
                  disabled={updateStatus.isPending}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Доставлено
                </Button>
              )}
              <Button
                variant="destructive"
                className="h-10 rounded-lg"
                onClick={() => setCancelDialog({ deliveryId: delivery.id, orderId: delivery.orderId })}
              >
                <X className="mr-2 h-4 w-4" />
                Отменить
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-4">
      <Card className="rounded-2xl border-none shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Доставка
            </CardTitle>
            <Badge variant={canAcceptMore ? "secondary" : "destructive"}>{deliveries.length}/3</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeDeliveries.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : deliveries.length ? (
            deliveries.map(renderDelivery)
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <Truck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Активных доставок нет. Возьмите заказ из списка ниже.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Доступные заказы</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canAcceptMore && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              У вас уже 3 активные доставки. Завершите или отмените одну из них, чтобы взять новую.
            </div>
          )}

          {availableOrders.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : availableOrders.data?.length ? (
            availableOrders.data.map((order: any) => (
              <div key={order.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">Заказ #{order.id}</p>
                  <Badge variant="secondary">{Number(order.totalAmount).toFixed(0)} ₽</Badge>
                </div>
                <p className="text-sm text-muted-foreground flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  {order.customerAddress}
                </p>
                <Button
                  className="h-10 w-full rounded-lg"
                  disabled={!canAcceptMore || acceptDelivery.isPending}
                  onClick={() => handleAccept(order.id)}
                >
                  {acceptDelivery.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Truck className="mr-2 h-4 w-4" />
                  )}
                  Взять заказ
                </Button>
              </div>
            ))
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">Нет доступных заказов.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!removeDialog} onOpenChange={(open) => !open && setRemoveDialog(null)}>
        <DialogContent className="w-[92vw] rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить товар из заказа</DialogTitle>
            <DialogDescription>{removeDialog?.itemName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={removeReasonKey} onValueChange={setRemoveReasonKey}>
              <SelectTrigger>
                <SelectValue placeholder="Причина" />
              </SelectTrigger>
              <SelectContent>
                {REMOVE_REASONS.map((reason) => (
                  <SelectItem key={reason.key} value={reason.key}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={removeDetails}
              onChange={(event) => setRemoveDetails(event.target.value)}
              placeholder="Опишите, что произошло с товаром"
              rows={4}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setRemoveDialog(null)}>
                Назад
              </Button>
              <Button
                variant="destructive"
                onClick={handleRemoveItem}
                disabled={removeItem.isPending || removeDetails.trim().length < 3}
              >
                Удалить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelDialog} onOpenChange={(open) => !open && setCancelDialog(null)}>
        <DialogContent className="w-[92vw] rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Отменить заказ #{cancelDialog?.orderId}</DialogTitle>
            <DialogDescription>Укажите причину, чтобы администратор видел историю решения.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={cancelReasonKey} onValueChange={setCancelReasonKey}>
              <SelectTrigger>
                <SelectValue placeholder="Причина" />
              </SelectTrigger>
              <SelectContent>
                {COURIER_CANCEL_REASONS.map((reason) => (
                  <SelectItem key={reason.key} value={reason.key}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={cancelDetails}
              onChange={(event) => setCancelDetails(event.target.value)}
              placeholder="Подробно опишите ситуацию"
              rows={4}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setCancelDialog(null)}>
                Назад
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelDelivery}
                disabled={cancelDelivery.isPending || cancelDetails.trim().length < 3}
              >
                Отменить заказ
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
