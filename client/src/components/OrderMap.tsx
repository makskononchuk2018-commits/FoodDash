import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, MapPin, Navigation, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CourierLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp: string;
}

interface OrderMapProps {
  orderId: number;
  courierLocation: CourierLocation | null | undefined;
  deliveryAddress: string;
  isLoading?: boolean;
  onExit?: () => void;
}

declare global {
  interface Window {
    ymaps?: any;
  }
}

const YANDEX_MAPS_SCRIPT_ID = "yandex-maps-api";
const YANDEX_MAPS_SRC = "https://api-maps.yandex.ru/2.1/?lang=ru_RU";

function loadYandexMaps() {
  if (window.ymaps) {
    return Promise.resolve(window.ymaps);
  }

  const existing = document.getElementById(YANDEX_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(window.ymaps));
      existing.addEventListener("error", reject);
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = YANDEX_MAPS_SCRIPT_ID;
    script.src = YANDEX_MAPS_SRC;
    script.async = true;
    script.onload = () => resolve(window.ymaps);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export function OrderMap({ orderId, courierLocation, deliveryAddress, isLoading, onExit }: OrderMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const courierMarkerRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const mapUrl = useMemo(() => {
    if (!courierLocation) return `https://yandex.com/maps/?text=${encodeURIComponent(deliveryAddress)}`;
    return `https://yandex.com/maps/?ll=${courierLocation.longitude},${courierLocation.latitude}&z=16`;
  }, [courierLocation, deliveryAddress]);

  useEffect(() => {
    let cancelled = false;

    if (!mapRef.current || mapReady || !courierLocation) return;

    loadYandexMaps()
      .then((ymaps) => {
        ymaps.ready(() => {
          if (cancelled || !mapRef.current || mapInstanceRef.current) return;

          const map = new ymaps.Map(mapRef.current, {
            center: [courierLocation.latitude, courierLocation.longitude],
            zoom: 15,
            controls: ["zoomControl", "typeSelector"],
          });

          mapInstanceRef.current = map;
          setMapReady(true);
        });
      })
      .catch(() => {
        if (!cancelled) {
          setMapError("Карта не загрузилась. Координаты курьера доступны ниже.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [courierLocation, mapReady]);

  useEffect(() => {
    if (!mapReady || !courierLocation || !window.ymaps || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current;
    const coords = [courierLocation.latitude, courierLocation.longitude];

    if (courierMarkerRef.current) {
      map.geoObjects.remove(courierMarkerRef.current);
    }

    const marker = new window.ymaps.Placemark(
      coords,
      {
        balloonContentHeader: "Курьер",
        balloonContentBody: `Заказ #${orderId}`,
      },
      {
        preset: "islands#redDeliveryIcon",
      },
    );

    courierMarkerRef.current = marker;
    map.geoObjects.add(marker);
    map.panTo(coords, { flying: true, duration: 500 });
  }, [courierLocation, mapReady, orderId]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const renderLocationDetails = () => {
    if (!courierLocation) return null;

    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-medium flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-600" />
          GPS активен
        </p>
        <div className="mt-2 space-y-1 text-xs">
          <p>
            Координаты: {courierLocation.latitude.toFixed(6)}, {courierLocation.longitude.toFixed(6)}
          </p>
          {courierLocation.accuracy ? <p>Точность: ±{Math.round(courierLocation.accuracy)} м</p> : null}
          {courierLocation.speed ? <p>Скорость: {Math.round(courierLocation.speed * 3.6)} км/ч</p> : null}
          <p>Обновлено: {new Date(courierLocation.timestamp).toLocaleTimeString("ru-RU")}</p>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card className="rounded-2xl border-none shadow-sm">
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-none shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Navigation className="h-5 w-5 text-primary" />
          Курьер на карте
        </CardTitle>
        {onExit && (
          <Button variant="outline" size="sm" onClick={onExit}>
            <X className="mr-2 h-4 w-4" />
            Выход
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!courierLocation ? (
          <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            Ожидаем первый GPS-сигнал от курьера.
          </div>
        ) : (
          <>
            {!mapError && (
              <div
                ref={mapRef}
                className="h-[350px] w-full overflow-hidden rounded-xl border bg-muted"
              />
            )}
            {mapError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {mapError}
                </p>
              </div>
            )}
            {renderLocationDetails()}
            <Button asChild variant="outline" className="w-full rounded-xl">
              <a href={mapUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Открыть в Яндекс Картах
              </a>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
