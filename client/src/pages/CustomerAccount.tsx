import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Clock,
  Headphones,
  History,
  Loader2,
  LogOut,
  MapPin,
  Newspaper,
  Phone,
  RefreshCw,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLogout } from "@/hooks/use-auth";
import {
  type CourierLocation,
  subscribeOrderEvents,
  useCourierLocation,
  useCustomerOrders,
  useOrderTimeline,
  useRepeatOrder,
} from "@/hooks/use-customer";
import { usePublicManagerContact } from "@/hooks/use-manager-contact";
import { OrderCancellationDialog, OrderDeletionButton } from "@/components/OrderCancellationDialog";
import { OrderMap } from "@/components/OrderMap";

const STATUS_LABEL: Record<string, string> = {
  new: "Новый",
  delivery: "В пути",
  completed: "Доставлен",
  cancelled: "Отменен",
  returning: "Возврат",
};

function readLocationUpdate(event: { eventType: string; metadata: Record<string, unknown> }): CourierLocation | null {
  if (event.eventType !== "location_update") {
    return null;
  }

  const location = event.metadata.location;

  if (!location || typeof location !== "object") {
    return null;
  }

  const candidate = location as Partial<CourierLocation>;

  if (
    typeof candidate.id !== "number" ||
    typeof candidate.courierId !== "number" ||
    typeof candidate.latitude !== "number" ||
    typeof candidate.longitude !== "number" ||
    typeof candidate.timestamp !== "string"
  ) {
    return null;
  }

  return candidate as CourierLocation;
}

function LinkCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: any;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="block rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </a>
  );
}

export default function CustomerAccount() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const orders = useCustomerOrders();
  const repeatOrder = useRepeatOrder();
  const logout = useLogout();
  const contact = usePublicManagerContact();

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);
  const [liveCourierLocation, setLiveCourierLocation] = useState<CourierLocation | null>(null);

  const selectedOrder = useMemo(
    () => orders.data?.find((order) => order.id === selectedOrderId) || null,
    [orders.data, selectedOrderId],
  );

  const trackingOrder = useMemo(
    () => orders.data?.find((order) => order.id === trackingOrderId) || null,
    [orders.data, trackingOrderId],
  );

  const timeline = useOrderTimeline(selectedOrderId);
  const courierLocation = useCourierLocation(trackingOrderId);
  const displayedCourierLocation = liveCourierLocation || courierLocation.data;

  useEffect(() => {
    setLiveCourierLocation(null);
  }, [trackingOrderId]);

  useEffect(() => {
    if (courierLocation.data !== undefined) {
      setLiveCourierLocation(courierLocation.data);
    }
  }, [courierLocation.data]);

  useEffect(() => {
    const orderId = trackingOrderId || selectedOrderId;
    if (!orderId) return;

    const stop = subscribeOrderEvents(orderId, (event) => {
      const location = readLocationUpdate(event);

      if (location) {
        if (event.orderId === trackingOrderId) {
          setLiveCourierLocation(location);
        }

        return;
      }

      orders.refetch();
      timeline.refetch();
      courierLocation.refetch();
    });

    return stop;
  }, [orders.refetch, selectedOrderId, trackingOrderId, timeline.refetch, courierLocation.refetch]);

  const handleRepeat = async (id: number) => {
    try {
      await repeatOrder.mutateAsync(id);
      toast({ title: "Заказ повторен", description: "Адрес и состав заказа применены автоматически" });
      orders.refetch();
    } catch (error) {
      toast({
        title: "Не удалось повторить заказ",
        description: error instanceof Error ? error.message : "Попробуйте еще раз",
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    await logout.mutateAsync();
    toast({ title: "Выход выполнен", description: "До встречи" });
    setLocation("/auth");
  };

  if (trackingOrder) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Отслеживание заказа #{trackingOrder.id}</h1>
            <p className="text-sm text-muted-foreground">{trackingOrder.customerAddress}</p>
          </div>
          <Button variant="outline" onClick={() => setTrackingOrderId(null)}>
            К истории
          </Button>
        </div>
        <OrderMap
          orderId={trackingOrder.id}
          courierLocation={displayedCourierLocation}
          deliveryAddress={trackingOrder.customerAddress}
          isLoading={courierLocation.isLoading}
          onExit={() => setTrackingOrderId(null)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Личный кабинет</h1>
          <p className="text-muted-foreground">История заказов, отмены и отслеживание доставки</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/">На витрину</Link>
          </Button>
          <Button variant="destructive" onClick={handleLogout} disabled={logout.isPending}>
            <LogOut className="mr-2 h-4 w-4" />
            Выйти
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <LinkCard
          href="https://max.ru/join/CSuQ83kXq2RCA4BcI26F12b_BF9uwgMxRIiGZMVoQb4"
          icon={Newspaper}
          title="Новости MAX"
          description="Перейти в новостную группу"
        />
        <LinkCard href="tel:+79126874953" icon={Phone} title="Звонок в MAX" description="Позвонить в службу" />
        <LinkCard
          href={contact.data?.telegramUrl || "https://max.ru/u/f9LHodD0cOKJyXx9spPr1Qc_3tGdWpdLED5xOB-SSjJw8Eo2vJyFCZjn0L4"}
          icon={Headphones}
          title="Связь"
          description="Перейти к менеджеру"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              История заказов
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {orders.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : orders.data?.length ? (
              orders.data.map((order) => {
                const canCancel = order.status === "new" && !order.courierId;
                const canTrack = ["delivery", "returning"].includes(order.status) && !!order.courierId;

                return (
                  <div
                    key={order.id}
                    role="button"
                    tabIndex={0}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      selectedOrderId === order.id ? "border-primary bg-primary/5" : "hover:border-primary/40"
                    }`}
                    onClick={() => setSelectedOrderId(order.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedOrderId(order.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">Заказ #{order.id}</p>
                      <Badge variant="secondary">{STATUS_LABEL[order.status] || order.status}</Badge>
                    </div>
                    <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                      {order.customerAddress}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{Number(order.totalAmount).toFixed(2)} ₽</p>
                      <div className="flex flex-wrap gap-2">
                        {canTrack && (
                          <Button
                            size="sm"
                            className="h-8"
                            onClick={(event) => {
                              event.stopPropagation();
                              setTrackingOrderId(order.id);
                            }}
                          >
                            <Truck className="mr-1 h-4 w-4" />
                            Отследить
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRepeat(order.id);
                          }}
                        >
                          <RefreshCw className="mr-1 h-4 w-4" />
                          Повторить
                        </Button>
                        {canCancel && (
                          <OrderCancellationDialog
                            order={order}
                            onSuccess={() => {
                              orders.refetch();
                              setSelectedOrderId(null);
                            }}
                          />
                        )}
                        <OrderDeletionButton
                          order={order}
                          onSuccess={() => {
                            orders.refetch();
                            setSelectedOrderId(null);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">У вас пока нет заказов.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Детали заказа
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedOrder ? (
              <p className="text-sm text-muted-foreground">Выберите заказ в истории, чтобы увидеть события и состав.</p>
            ) : timeline.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="font-semibold">Заказ #{selectedOrder.id}</p>
                  <p className="text-sm text-muted-foreground">
                    Статус: {STATUS_LABEL[selectedOrder.status] || selectedOrder.status}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Товаров: {selectedOrder.items.length} · {Number(selectedOrder.totalAmount).toFixed(0)} ₽
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">История событий</p>
                  {timeline.data?.length ? (
                    timeline.data.map((event) => (
                      <div key={event.id} className="rounded-xl border p-3">
                        <p className="text-sm font-medium">{event.eventMessage}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(event.createdAt).toLocaleString("ru-RU")}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Событий пока нет.</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
