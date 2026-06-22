import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Eye,
  Info,
  Loader2,
  MapPin,
  MoreHorizontal,
  Package,
  Phone,
  Search,
  Trash2,
  Truck,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  useAdminOrders,
  useCouriersList,
  useOrderCancellation,
  useOrderItems,
  useReassignOrder,
  useRemoveOrderItem,
  useUnassignOrder,
  useUpdateAdminDeliverySequence,
  useUpdateOrderStatus,
} from "@/hooks/use-orders";
import type { OrderStatus } from "@shared/schema";

const STATUS_CONFIG = {
  new: { label: "Новый заказ", color: "bg-blue-500", icon: Package },
  delivery: { label: "В доставке", color: "bg-purple-500", icon: Truck },
  completed: { label: "Завершен", color: "bg-emerald-500", icon: CheckCircle2 },
  cancelled: { label: "Отменен", color: "bg-red-500", icon: Package },
  returning: { label: "Возврат", color: "bg-amber-500", icon: Clock },
};

const STATUS_FILTERS = [
  { value: "all", label: "Все статусы" },
  { value: "new", label: "Новые" },
  { value: "delivery", label: "В доставке" },
  { value: "completed", label: "Завершены" },
  { value: "cancelled", label: "Отменены" },
  { value: "returning", label: "Возвраты" },
] as const;

function getStatusLabel(status: string) {
  return STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.label || status;
}

export default function Orders() {
  const { data: orders, isLoading } = useAdminOrders();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const sortedOrders = useMemo(
    () =>
      [...(orders || [])].sort(
        (a: any, b: any) => {
          const actionTimeA = new Date(a.lastActionAt || a.updatedAt || a.createdAt).getTime();
          const actionTimeB = new Date(b.lastActionAt || b.updatedAt || b.createdAt).getTime();

          if (actionTimeA !== actionTimeB) {
            return actionTimeB - actionTimeA;
          }

          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        },
      ),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    return sortedOrders.filter((order: any) => {
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      const searchable = [
        String(order.id),
        order.customerName,
        order.customerPhone,
        order.customerAddress,
        order.courier?.fullName,
        getStatusLabel(order.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!query || searchable.includes(query));
    });
  }, [search, sortedOrders, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: sortedOrders.length };
    for (const order of sortedOrders) {
      counts[order.status] = (counts[order.status] || 0) + 1;
    }
    return counts;
  }, [sortedOrders]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold sm:text-3xl">Управление заказами</h1>
          <p className="text-sm text-muted-foreground sm:text-base">Статусы, курьеры, состав заказов и история отмен</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Всего" value={sortedOrders.length} />
          <Metric label="Активные" value={(statusCounts.new || 0) + (statusCounts.delivery || 0) + (statusCounts.returning || 0)} />
          <Metric label="Завершены" value={statusCounts.completed || 0} />
          <Metric label="Отмены" value={statusCounts.cancelled || 0} />
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 rounded-xl bg-muted/30 pl-9"
              placeholder="Поиск по ID, клиенту, телефону, адресу или курьеру"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 rounded-xl bg-muted/30">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label} ({statusCounts[status.value] || 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="hidden grid-cols-[1fr_1.45fr_0.8fr_0.85fr_1.2fr_1fr_0.9fr] gap-4 border-b bg-muted/40 p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <div>Заказ</div>
          <div>Клиент</div>
          <div>Состав</div>
          <div>Сумма</div>
          <div>Курьер</div>
          <div>Статус</div>
          <div className="text-right">Действия</div>
        </div>
        <div className="divide-y">
          {filteredOrders.map((order: any) => (
            <OrderRow key={order.id} order={order} />
          ))}
          {filteredOrders.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {sortedOrders.length === 0 ? "Заказов пока нет." : "По выбранным фильтрам заказов нет."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-display font-bold">{value}</div>
    </div>
  );
}

function OrderRow({ order }: { order: any }) {
  const { toast } = useToast();
  const updateStatus = useUpdateOrderStatus();
  const unassignOrder = useUnassignOrder();
  const updateDeliverySequence = useUpdateAdminDeliverySequence();
  const config = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.new;
  const routeSize = Number(order.deliveryInfo?.routeSize || 0);
  const deliverySequence = Number(order.deliveryInfo?.sequence || 0);

  const handleStatusChange = (status: OrderStatus) => {
    updateStatus.mutate(
      { id: order.id, status },
      {
        onSuccess: () => toast({ description: "Статус заказа обновлен" }),
        onError: (error) =>
          toast({
            title: "Не удалось обновить статус",
            description: error instanceof Error ? error.message : "Попробуйте еще раз",
            variant: "destructive",
          }),
      },
    );
  };

  const handleUnassign = () => {
    unassignOrder.mutate(order.id, {
      onSuccess: () => toast({ description: "Курьер снят с заказа" }),
      onError: (error) =>
        toast({
          title: "Не удалось снять курьера",
          description: error instanceof Error ? error.message : "Попробуйте еще раз",
          variant: "destructive",
        }),
    });
  };

  const handleMoveDelivery = (newSequence: number) => {
    if (!order.deliveryInfo?.id) return;

    updateDeliverySequence.mutate(
      { deliveryId: order.deliveryInfo.id, newSequence },
      {
        onSuccess: () => toast({ description: "Порядок заказов у курьера обновлен" }),
        onError: (error) =>
          toast({
            title: "Не удалось изменить порядок",
            description: error instanceof Error ? error.message : "Попробуйте еще раз",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 p-4 transition-colors hover:bg-muted/20 md:grid-cols-[1fr_1.45fr_0.8fr_0.85fr_1.2fr_1fr_0.9fr] md:items-center">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Заказ</div>
        <div className="font-mono text-sm font-medium">#{String(order.id).padStart(4, "0")}</div>
        <div className="text-xs text-muted-foreground">
          {format(new Date(order.createdAt), "d MMM, HH:mm", { locale: ru })}
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Клиент</div>
        <div className="flex items-center gap-1 text-sm font-medium">
          <User className="h-3 w-3" />
          <span className="truncate">{order.customerName}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Phone className="h-3 w-3" />
          {order.customerPhone}
        </div>
        <div className="flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          {order.customerAddress}
        </div>
      </div>

      <OrderItemsDialog orderId={order.id} />

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Сумма</div>
        <div className="font-mono text-sm font-medium">{Number(order.totalAmount).toFixed(2)} ₽</div>
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Курьер</div>
        {order.courier ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{order.courier.fullName}</div>
              {order.deliveryInfo?.sequence ? (
                <div className="text-xs text-muted-foreground">Позиция {order.deliveryInfo.sequence}</div>
              ) : null}
            </div>
            {order.deliveryInfo?.id && routeSize > 1 ? (
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => handleMoveDelivery(deliverySequence - 1)}
                  disabled={deliverySequence <= 1 || updateDeliverySequence.isPending}
                  title="Поднять заказ"
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => handleMoveDelivery(deliverySequence + 1)}
                  disabled={deliverySequence >= routeSize || updateDeliverySequence.isPending}
                  title="Опустить заказ"
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>
            ) : null}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleUnassign} title="Снять курьера">
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ) : (
          <AssignCourierDialog orderId={order.id} disabled={["completed", "cancelled"].includes(order.status)} />
        )}
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Статус</div>
        <Badge variant="secondary" className={cn("gap-2 border-0 bg-opacity-10 pl-2 pr-3 font-normal text-foreground", config.color)}>
          <div className={`h-2 w-2 rounded-full ${config.color}`} />
          {config.label}
        </Badge>
      </div>

      <div className="flex justify-start gap-1 md:justify-end">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Информация об отмене">
              <Info className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <CancellationInfo orderId={order.id} />
          </DialogContent>
        </Dialog>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleStatusChange("delivery")}>В доставку</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusChange("completed")}>Завершить</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusChange("returning")}>Возврат</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusChange("cancelled")} className="text-destructive">
              Отменить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function AssignCourierDialog({ orderId, disabled }: { orderId: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [courierId, setCourierId] = useState("");
  const { toast } = useToast();
  const couriers = useCouriersList();
  const reassignOrder = useReassignOrder();

  const handleAssign = () => {
    if (!courierId) return;

    reassignOrder.mutate(
      { orderId, courierId: Number(courierId) },
      {
        onSuccess: () => {
          toast({ description: "Курьер назначен" });
          setOpen(false);
          setCourierId("");
        },
        onError: (error) =>
          toast({
            title: "Не удалось назначить курьера",
            description: error instanceof Error ? error.message : "Попробуйте еще раз",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={disabled}>
          Назначить
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Назначить курьера</DialogTitle>
          <DialogDescription>Курьер может вести не больше трех активных доставок.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Select value={courierId} onValueChange={setCourierId}>
            <SelectTrigger>
              <SelectValue placeholder={couriers.isLoading ? "Загрузка..." : "Выберите курьера"} />
            </SelectTrigger>
            <SelectContent>
              {couriers.data?.map((courier) => (
                <SelectItem key={courier.id} value={String(courier.id)} disabled={!courier.isAvailable}>
                  {courier.fullName} {courier.phone ? `(${courier.phone})` : ""} · {courier.activeDeliveries}/3
                </SelectItem>
              ))}
              {!couriers.isLoading && !couriers.data?.length ? (
                <SelectItem value="empty" disabled>
                  Курьеры не найдены
                </SelectItem>
              ) : null}
            </SelectContent>
          </Select>
          <Button className="w-full" onClick={handleAssign} disabled={!courierId || reassignOrder.isPending}>
            {reassignOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Назначить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OrderItemsDialog({ orderId }: { orderId: number }) {
  const { data: items, isLoading } = useOrderItems(orderId);

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground">
          <Eye className="mr-1 h-3 w-3" />
          {items?.current?.length || 0} поз.
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Товары заказа #{orderId}</DialogTitle>
        </DialogHeader>
        <OrderItemsList orderId={orderId} items={items} />
      </DialogContent>
    </Dialog>
  );
}

function OrderItemsList({ orderId, items }: { orderId: number; items: any }) {
  const [reason, setReason] = useState("");
  const removeItem = useRemoveOrderItem();
  const { toast } = useToast();

  const handleRemove = (itemId: number) => {
    removeItem.mutate(
      { orderId, orderItemId: itemId, reason: reason || "Удалено администратором" },
      {
        onSuccess: () => {
          toast({ description: "Товар удален из заказа" });
          setReason("");
        },
        onError: (error) =>
          toast({
            title: "Не удалось удалить товар",
            description: error instanceof Error ? error.message : "Попробуйте еще раз",
            variant: "destructive",
          }),
      },
    );
  };

  if (!items) return <div className="text-sm text-muted-foreground">Загрузка товаров...</div>;

  return (
    <div className="space-y-4">
      <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Причина удаления товара" />
      <div>
        <h3 className="mb-2 font-semibold">Текущие товары ({items.current?.length || 0})</h3>
        <div className="space-y-2">
          {items.current?.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between rounded border bg-muted/50 p-2">
              <div>
                <div className="text-sm font-medium">{item.product?.name}</div>
                <div className="text-xs text-muted-foreground">
                  {item.quantity} x {Number(item.price).toFixed(2)} ₽
                </div>
              </div>
              <Button size="sm" variant="destructive" className="h-8" onClick={() => handleRemove(item.id)} disabled={removeItem.isPending}>
                Удалить
              </Button>
            </div>
          ))}
          {!items.current?.length ? <div className="text-sm text-muted-foreground">Нет товаров в заказе</div> : null}
        </div>
      </div>

      {items.removed?.length ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Удаленные товары</h3>
          <div className="space-y-2">
            {items.removed.map((item: any) => (
              <div key={item.id} className="rounded border border-dashed bg-destructive/5 p-2 text-xs">
                <div className="font-medium">{item.product?.name}</div>
                <div className="text-muted-foreground">
                  {item.quantity} x {Number(item.price).toFixed(2)} ₽
                </div>
                {item.reason ? <div className="text-muted-foreground">Причина: {item.reason}</div> : null}
                <div className="text-muted-foreground">
                  {item.removedByRole} · {format(new Date(item.createdAt), "d MMM HH:mm", { locale: ru })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CancellationInfo({ orderId }: { orderId: number }) {
  const { data: cancellation, isLoading } = useOrderCancellation(orderId);

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;

  if (!cancellation) {
    return (
      <div>
        <DialogHeader>
          <DialogTitle>Информация об отмене</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">Этот заказ не был отменен.</div>
      </div>
    );
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>Отмена заказа #{orderId}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <div className="text-xs font-semibold text-muted-foreground">Когда</div>
          <div className="text-sm">{format(new Date(cancellation.createdAt), "d MMM HH:mm", { locale: ru })}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground">Кто отменил</div>
          <div className="text-sm">
            {cancellation.cancelledBy?.fullName || "Система"} ({cancellation.cancelledByRole})
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground">Причина</div>
          <div className="text-sm">{cancellation.reason?.reasonText || cancellation.reasonKey}</div>
        </div>
        {cancellation.reasonDetails ? (
          <div>
            <div className="text-xs font-semibold text-muted-foreground">Комментарий</div>
            <div className="text-sm">{cancellation.reasonDetails}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
