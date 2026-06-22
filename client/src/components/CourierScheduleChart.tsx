import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, User } from "lucide-react";
import { motion } from "framer-motion";
import { useAdminCourierSchedule } from "@/hooks/use-admin";
import type { CourierScheduleItem } from "@/hooks/use-admin";

const DAYS_OF_WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DAYS_FULL = {
  Monday: "Пн",
  Tuesday: "Вт",
  Wednesday: "Ср",
  Thursday: "Чт",
  Friday: "Пт",
  Saturday: "Сб",
  Sunday: "Вс",
};

const TIME_SLOTS = ["08:00-12:00", "12:00-16:00", "16:00-20:00", "20:00-23:59"];

function normalizeDay(day: string): string {
  const normalized = day.trim().toLowerCase();
  if (normalized === "пн" || normalized === "monday") return "Пн";
  if (normalized === "вт" || normalized === "tuesday") return "Вт";
  if (normalized === "ср" || normalized === "wednesday") return "Ср";
  if (normalized === "чт" || normalized === "thursday") return "Чт";
  if (normalized === "пт" || normalized === "friday") return "Пт";
  if (normalized === "сб" || normalized === "saturday") return "Сб";
  if (normalized === "вс" || normalized === "sunday") return "Вс";
  return day;
}

function getDayOrder(day: string): number {
  const normalized = normalizeDay(day);
  return DAYS_OF_WEEK.indexOf(normalized);
}

export function CourierScheduleChart() {
  const { data: schedules, isLoading } = useAdminCourierSchedule();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!schedules || schedules.length === 0) {
    return (
      <Card className="rounded-2xl border-none shadow-sm">
        <CardContent className="p-8 text-center">
          <User className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">Курьеров не найдено</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-none shadow-sm overflow-hidden">
        <CardHeader className="p-6 pb-4">
          <CardTitle className="text-lg font-display font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            График работы курьеров
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">Еженедельное расписание доступности курьеров</p>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-6 py-3 text-left text-xs font-bold text-muted-foreground sticky left-0 bg-muted/50 z-10">
                    Курьер
                  </th>
                  {DAYS_OF_WEEK.map((day) => (
                    <th key={day} className="px-3 py-3 text-center text-xs font-bold text-muted-foreground whitespace-nowrap">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedules.map((courier, idx) => {
                  const scheduleMap = Object.fromEntries(
                    courier.schedules.map((s) => [normalizeDay(s.dayOfWeek), s]),
                  );

                  return (
                    <motion.tr
                      key={courier.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="border-b hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium sticky left-0 bg-white hover:bg-muted/30 z-10">
                        <div>
                          <p className="text-sm font-semibold">{courier.fullName}</p>
                          <div className="flex flex-col gap-1 mt-1 text-xs text-muted-foreground">
                            {courier.email && <p>{courier.email}</p>}
                            {courier.phone && <p>{courier.phone}</p>}
                          </div>
                        </div>
                      </td>
                      {DAYS_OF_WEEK.map((day) => {
                        const schedule = scheduleMap[day];
                        const isWorking = schedule && schedule.timeSlots.length > 0;

                        return (
                          <td key={day} className="px-3 py-4 text-center">
                            {isWorking ? (
                              <div className="flex flex-col gap-1">
                                {schedule!.timeSlots.map((slot, slotIdx) => (
                                  <Badge
                                    key={slotIdx}
                                    className="rounded-full bg-emerald-100 text-emerald-700 border-0 text-xs font-medium mx-auto block w-fit px-2 py-1"
                                  >
                                    {slot}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <Badge variant="outline" className="rounded-full bg-gray-50 text-gray-500 border-gray-200 text-xs font-medium">
                                Выходной
                              </Badge>
                            )}
                          </td>
                        );
                      })}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-none shadow-sm">
            <CardContent className="p-6">
              <div className="text-sm text-muted-foreground">Всего курьеров</div>
              <p className="text-3xl font-bold text-primary mt-2">{schedules.length}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="border-none shadow-sm">
            <CardContent className="p-6">
              <div className="text-sm text-muted-foreground">Доступны сегодня</div>
              <p className="text-3xl font-bold text-emerald-600 mt-2">
                {schedules.filter((c) => {
                  const today = new Date();
                  const dayName = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][today.getDay()];
                  return c.schedules.some((s) => normalizeDay(s.dayOfWeek) === dayName && s.timeSlots.length > 0);
                }).length}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-none shadow-sm">
            <CardContent className="p-6">
              <div className="text-sm text-muted-foreground">Средние часы в неделю</div>
              <p className="text-3xl font-bold text-blue-600 mt-2">
                {Math.round(
                  schedules.reduce((sum, c) => {
                    const totalSlots = c.schedules.reduce((s, d) => s + d.timeSlots.length, 0);
                    return sum + totalSlots;
                  }, 0) / schedules.length,
                )}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
