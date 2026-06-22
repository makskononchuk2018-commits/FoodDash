import { CourierScheduleChart } from "@/components/CourierScheduleChart";

export default function CourierScheduleChartPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-display font-bold">График курьеров</h1>
        <p className="text-muted-foreground">Управление расписанием и доступностью курьеров</p>
      </div>

      <CourierScheduleChart />
    </div>
  );
}
