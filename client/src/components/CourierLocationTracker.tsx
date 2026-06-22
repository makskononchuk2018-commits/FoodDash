import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CourierLocationTrackerProps {
  orderId: number;
  isActive: boolean;
}

export function CourierLocationTracker({ orderId, isActive }: CourierLocationTrackerProps) {
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isAutoStarted, setIsAutoStarted] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Автоматически начинаем отслеживание когда заказ активен
  useEffect(() => {
    if (isActive && !isAutoStarted) {
      setIsAutoStarted(true);
      setIsTracking(true);
    }
  }, [isActive, isAutoStarted]);

  useEffect(() => {
    if (!isActive) {
      stopTracking();
      return;
    }

    if (isTracking) {
      startTracking();
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, isTracking]);

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError("Геолокация не поддерживается вашим браузером");
      setIsTracking(false);
      return;
    }

    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          const { latitude, longitude, accuracy, speed, heading } = position.coords;

          const response = await fetch("/api/courier/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              orderId,
              latitude,
              longitude,
              accuracy,
              speed: speed ?? undefined,
              heading: heading ?? undefined,
            }),
          });

          if (!response.ok) {
            throw new Error("Не удалось отправить GPS координаты");
          }

          setLastUpdate(new Date());
        } catch (err) {
          console.error("GPS tracking error:", err);
          setError(err instanceof Error ? err.message : "Ошибка при отправке GPS координат");
        }
      },
      (err) => {
        console.error("Geolocation error:", err);
        let errorMsg = "Ошибка при получении GPS координат";

        if (err.code === err.PERMISSION_DENIED) {
          errorMsg = "Доступ к геолокации запрещен. Разрешите доступ в настройках браузера.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          errorMsg = "GPS позиция недоступна. Проверьте сигнал GPS.";
        } else if (err.code === err.TIMEOUT) {
          errorMsg = "Истекло время ожидания GPS сигнала.";
        }

        setError(errorMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setLastUpdate(null);
  };

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isAutoStarted && !error && (
        <Alert className="bg-blue-50 border-blue-200">
          <MapPin className="w-4 h-4 text-blue-600" />
          <AlertDescription className="text-blue-700 text-sm">
            GPS отслеживание активировано автоматически
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          className="flex-1 rounded-xl h-11"
          onClick={() => (isTracking ? stopTracking() : setIsTracking(true))}
          disabled={!isActive}
          variant={isTracking ? "destructive" : "default"}
        >
          {isTracking ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Отслеживание активно
            </>
          ) : (
            <>
              <MapPin className="w-4 h-4 mr-2" />
              Начать отслеживание
            </>
          )}
        </Button>
      </div>

      {lastUpdate && isTracking && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-3">
          <p className="text-xs text-green-700 font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            GPS активен • Последнее обновление:{" "}
            {lastUpdate.toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>
      )}
    </div>
  );
}
