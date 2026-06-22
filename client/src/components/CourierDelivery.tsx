import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAcceptCourierOrder, useCourierActiveOrders, useCourierAvailableOrders, useCourierUpdateStatus } from "@/hooks/use-courier";
import { CheckCircle2, Loader2, MapPin, Phone, Truck } from "lucide-react";
import { CourierLocationTracker } from "@/components/CourierLocationTracker";

export function CourierDelivery() {
  const { toast } = useToast();
  const available = useCourierAvailableOrders();
  const active = useCourierActiveOrders();

  const acceptOrder = useAcceptCourierOrder();
  const updateStatus = useCourierUpdateStatus();

  const activeOrder = active.data?.[0] || null;

  const handleAccept = async (id: number) => {
    try {
      await acceptOrder.mutateAsync(id);
      toast({ title: "Заказ принят", description: "Маршрут и контакт клиента доступны" });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось принять заказ",
        variant: "destructive",
      });
    }
  };

  const handleComplete = async () => {
    if (!activeOrder) return;

    try {
      await updateStatus.mutateAsync({ id: activeOrder.id, status: "completed" });
      toast({ title: "Заказ завершен" });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось завершить заказ",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <Card className="rounded-2xl border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Активная доставка</CardTitle>
        </CardHeader>
        <CardContent>
          {active.isLoading ? (
            <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : activeOrder ? (
            <div className="space-y-3">
              <Badge className="bg-primary text-white">Заказ #{activeOrder.id}</Badge>
              <p className="text-sm font-medium flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> {activeOrder.customerAddress}</p>
              <p className="text-sm text-muted-foreground">Клиент: {activeOrder.customerName}</p>
              <Button asChild className="w-full h-11 rounded-xl">
                <a href={`tel:${activeOrder.customerPhone}`}><Phone className="w-4 h-4 mr-2" />Позвонить клиенту</a>
              </Button>
              <Button asChild variant="outline" className="w-full h-11 rounded-xl">
                <a href={`https://yandex.com/maps/?text=${encodeURIComponent(activeOrder.customerAddress)}`} target="_blank" rel="noreferrer">
                  <MapPin className="w-4 h-4 mr-2" />Открыть маршрут
                </a>
              </Button>
              <CourierLocationTracker orderId={activeOrder.id} isActive={true} />
              <Button className="w-full h-11 rounded-xl" onClick={handleComplete} disabled={updateStatus.isPending}>
                {updateStatus.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Доставлено
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Сейчас нет активной доставки.</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Доступные заказы</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {available.isLoading ? (
            <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : available.data?.length ? (
            available.data.map((order) => (
              <div key={order.id} className="rounded-xl border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Заказ #{order.id}</p>
                  <Badge variant="secondary">{Number(order.totalAmount).toFixed(0)} ₽</Badge>
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{order.customerAddress}</p>
                <Button className="w-full h-10 rounded-xl" onClick={() => handleAccept(order.id)} disabled={acceptOrder.isPending || !!activeOrder}>
                  <Truck className="w-4 h-4 mr-2" />Взять заказ
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Нет доступных заказов.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
