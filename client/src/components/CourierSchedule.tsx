import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCourierSchedule, useUpdateCourierSchedule } from "@/hooks/use-courier";
import { Clock, Check, X, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const WEEK_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const TIME_SLOTS = [
  "08:00-12:00", "12:00-16:00", "16:00-20:00", "20:00-23:59"
];

const DAYS_MAP: Record<string, string> = {
  "Пн": "Пн",
  "Вт": "Вт",
  "Ср": "Ср",
  "Чт": "Чт",
  "Пт": "Пт",
  "Сб": "Сб",
  "Вс": "Вс",
  "Monday": "Пн",
  "Tuesday": "Вт",
  "Wednesday": "Ср",
  "Thursday": "Чт",
  "Friday": "Пт",
  "Saturday": "Сб",
  "Sunday": "Вс",
};

export function CourierSchedule() {
  const { toast } = useToast();
  const { data: loadedSchedule, isLoading } = useCourierSchedule();
  const { mutateAsync: updateSchedule, isPending: isSaving } = useUpdateCourierSchedule();
  const [schedule, setSchedule] = useState<Record<string, Set<string>>>({
    Пн: new Set(),
    Вт: new Set(),
    Ср: new Set(),
    Чт: new Set(),
    Пт: new Set(),
    Сб: new Set(),
    Вс: new Set(),
  });

  useEffect(() => {
    if (loadedSchedule && loadedSchedule.length > 0) {
      const newSchedule: Record<string, Set<string>> = {
        Пн: new Set(),
        Вт: new Set(),
        Ср: new Set(),
        Чт: new Set(),
        Пт: new Set(),
        Сб: new Set(),
        Вс: new Set(),
      };

      loadedSchedule.forEach((item) => {
        const dayKey = DAYS_MAP[item.dayOfWeek] || item.dayOfWeek;
        if (newSchedule[dayKey]) {
          newSchedule[dayKey] = new Set(item.timeSlots);
        }
      });

      setSchedule(newSchedule);
    }
  }, [loadedSchedule]);

  const isAvailable = Object.values(schedule).some(s => s.size > 0);

  const toggleSlot = (day: string, time: string) => {
    setSchedule(prev => {
      const updated = { ...prev };
      if (updated[day].has(time)) {
        updated[day].delete(time);
      } else {
        updated[day].add(time);
      }
      return updated;
    });
  };

  const saveSchedule = async () => {
    try {
      const updates = Object.entries(schedule).map(([day, slots]) =>
        updateSchedule({
          dayOfWeek: day,
          timeSlots: Array.from(slots),
        }),
      );

      await Promise.all(updates);

      toast({
        title: "График сохранен",
        description: "Ваше расписание обновлено",
      });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось сохранить график",
        variant: "destructive",
      });
    }
  };

  const setFullDay = (day: string) => {
    setSchedule(prev => ({
      ...prev,
      [day]: new Set(TIME_SLOTS)
    }));
  };

  const clearDay = (day: string) => {
    setSchedule(prev => ({
      ...prev,
      [day]: new Set()
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-none shadow-sm bg-blue-50 border-l-4 border-l-blue-600">
        <CardContent className="p-4">
          <p className="text-sm font-medium text-blue-900">
            {isAvailable ? "✓ Вы доступны" : "✗ Вы не доступны"}
          </p>
          <p className="text-xs text-blue-700 mt-1">
            Выберите время, когда вы готовы принимать заказы
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {WEEK_DAYS.map((day, idx) => {
          const daySchedule = schedule[day];
          const isFullDay = daySchedule.size === TIME_SLOTS.length;
          const hasSchedule = daySchedule.size > 0;

          return (
            <motion.div
              key={day}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className="rounded-2xl border-none shadow-sm overflow-hidden">
                <CardHeader className="p-4 pb-3 bg-white border-b flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base font-bold">{day}</CardTitle>
                    {hasSchedule && (
                      <Badge className="rounded-full bg-emerald-100 text-emerald-700 border-0">
                        {daySchedule.size}/{TIME_SLOTS.length}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs rounded-lg"
                      onClick={() => setFullDay(day)}
                      disabled={isSaving}
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Весь день
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs rounded-lg text-destructive hover:bg-destructive/10"
                      onClick={() => clearDay(day)}
                      disabled={isSaving}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Очистить
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 grid grid-cols-2 gap-2">
                  {TIME_SLOTS.map((time) => {
                    const isSelected = daySchedule.has(time);
                    return (
                      <Button
                        key={time}
                        variant={isSelected ? "default" : "outline"}
                        className={`rounded-lg h-10 text-xs font-medium transition-all ${
                          isSelected ? "bg-primary text-white shadow-md" : ""
                        }`}
                        onClick={() => toggleSlot(day, time)}
                        disabled={isSaving}
                      >
                        <Clock className="w-3 h-3 mr-1" />
                        {time}
                      </Button>
                    );
                  })}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Button
        className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg shadow-primary/20 sticky bottom-4"
        onClick={saveSchedule}
        disabled={isSaving}
      >
        {isSaving ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : (
          <Check className="mr-2 h-5 w-5" />
        )}
        {isSaving ? "Сохранение..." : "Сохранить график"}
      </Button>
    </div>
  );
}
