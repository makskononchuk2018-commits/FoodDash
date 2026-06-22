import { useState } from "react";
import { AlertCircle, Loader2, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCancellationReasons, useDeleteOrder, useOrderCancellation } from "@/hooks/use-customer";

interface OrderWithStatus {
  id: number;
  status: string;
  customerName: string;
  totalAmount: string;
}

export function OrderCancellationDialog({ order, onSuccess }: { order: OrderWithStatus; onSuccess?: () => void }) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState("");
  const [details, setDetails] = useState("");

  const reasons = useCancellationReasons("customer");
  const cancelOrder = useOrderCancellation();
  const selectedReasonObj = (reasons.data || []).find((reason) => reason.reasonKey === selectedReason);
  const detailsIsValid = details.trim().length >= 10;

  if (order.status !== "new") return null;

  const handleSubmit = async () => {
    if (!selectedReason || !detailsIsValid) {
      toast({
        title: "Заполните причину отмены",
        description: "Выберите причину и напишите подробный комментарий минимум на 10 символов.",
        variant: "destructive",
      });
      return;
    }

    try {
      await cancelOrder.mutateAsync({
        orderId: order.id,
        reasonKey: selectedReason,
        reasonDetails: details.trim(),
      });

      toast({ title: "Заказ отменен" });
      setIsOpen(false);
      setSelectedReason("");
      setDetails("");
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Не удалось отменить заказ",
        description: error instanceof Error ? error.message : "Попробуйте еще раз",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="destructive"
          size="sm"
          className="h-8 rounded-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <X className="mr-1 h-4 w-4" />
          Отменить
        </Button>
      </DialogTrigger>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] max-w-md grid-rows-[auto,minmax(0,1fr),auto] overflow-hidden rounded-2xl p-0 sm:max-h-[calc(100vh-4rem)]">
        <DialogHeader className="border-b px-6 pb-4 pr-12 pt-6">
          <DialogTitle>Отмена заказа</DialogTitle>
          <DialogDescription>
            Заказ #{order.id} · {Number(order.totalAmount).toFixed(0)} ₽
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            Активный заказ можно отменить только до передачи курьеру. После отправки формы заказ перейдет в статус “Отменен”.
          </div>

          <div className="space-y-3">
            <Label className="font-semibold">Причина отмены</Label>
            <RadioGroup value={selectedReason} onValueChange={setSelectedReason}>
              {reasons.isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-2">
                  {reasons.data?.map((reason) => (
                    <button
                      key={reason.reasonKey}
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                        selectedReason === reason.reasonKey ? "border-primary bg-primary/5" : "hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedReason(reason.reasonKey)}
                    >
                      <RadioGroupItem value={reason.reasonKey} id={reason.reasonKey} />
                      <span className="flex-1">
                        <Label htmlFor={reason.reasonKey} className="cursor-pointer font-medium">
                          {reason.reasonText}
                        </Label>
                        {reason.category ? (
                          <Badge variant="secondary" className="mt-1 block w-fit text-xs">
                            {reason.category}
                          </Badge>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancel-details" className="font-semibold">
              Подробный комментарий
            </Label>
            <Textarea
              id="cancel-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              onKeyDownCapture={(event) => event.stopPropagation()}
              placeholder="Например: неверно указал адрес, хочу оформить новый заказ..."
              rows={4}
            />
            <p className={`text-xs ${detailsIsValid ? "text-muted-foreground" : "text-destructive"}`}>
              Минимум 10 символов · сейчас {details.trim().length}
            </p>
          </div>

          {selectedReasonObj && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              Выбрано: <span className="font-semibold">{selectedReasonObj.reasonText}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 border-t p-4 sm:grid-cols-2 sm:p-6">
          <Button variant="outline" className="rounded-lg" onClick={() => setIsOpen(false)}>
            Назад
          </Button>
          <Button
            variant="destructive"
            className="rounded-lg"
            onClick={handleSubmit}
            disabled={cancelOrder.isPending || !selectedReason || !detailsIsValid}
          >
            {cancelOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Отменить заказ"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OrderDeletionButton({ order, onSuccess }: { order: OrderWithStatus; onSuccess?: () => void }) {
  const { toast } = useToast();
  const deleteOrder = useDeleteOrder();
  const [isOpen, setIsOpen] = useState(false);

  if (order.status !== "completed") return null;

  const handleDelete = async () => {
    try {
      await deleteOrder.mutateAsync(order.id);
      toast({ title: "Заказ удален", description: "Заказ скрыт из вашей истории." });
      setIsOpen(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Не удалось удалить заказ",
        description: error instanceof Error ? error.message : "Попробуйте еще раз",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 rounded-lg text-destructive hover:text-destructive">
          <Trash2 className="mr-1 h-4 w-4" />
          Удалить
        </Button>
      </DialogTrigger>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] max-w-sm grid-rows-[auto,minmax(0,1fr),auto] overflow-hidden rounded-2xl p-0 sm:max-h-[calc(100vh-4rem)]">
        <DialogHeader className="border-b px-6 pb-4 pr-12 pt-6">
          <DialogTitle>Удалить заказ из истории</DialogTitle>
          <DialogDescription>Заказ #{order.id}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto px-6 py-4">
          <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            Заказ будет скрыт только в вашем личном кабинете. У администратора история сохранится.
          </div>
          <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Удалять можно только доставленные заказы.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 border-t p-4 sm:grid-cols-2 sm:p-6">
          <Button variant="outline" className="rounded-lg" onClick={() => setIsOpen(false)}>
            Назад
          </Button>
          <Button variant="destructive" className="rounded-lg" onClick={handleDelete} disabled={deleteOrder.isPending}>
            {deleteOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Удалить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
