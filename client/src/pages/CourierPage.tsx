import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, User, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLogout } from "@/hooks/use-auth";
import { CourierSchedule } from "@/components/CourierSchedule";
import { CourierAccount } from "@/components/CourierAccount";
import { CourierActiveDeliveries } from "@/components/CourierActiveDeliveries";

export default function CourierPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const logout = useLogout();
  const [activeTab, setActiveTab] = useState("delivery");

  const handleLogout = async () => {
    await logout.mutateAsync();
    toast({ title: "Выход выполнен", description: "До встречи" });
    setLocation("/auth");
  };

  return (
    <div className="min-h-screen bg-muted/10 pb-20">
      <header className="sticky top-0 z-40 bg-white border-b shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-bold text-primary">FoodDash</h1>
            <p className="text-xs text-muted-foreground">Панель курьера</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} disabled={logout.isPending}>
            <LogOut className="w-4 h-4 mr-2" />
            Выйти
          </Button>
        </div>
      </header>

      <div className="max-w-md mx-auto mt-4 px-2">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 w-full rounded-2xl h-14 bg-white border shadow-sm p-1">
            <TabsTrigger value="delivery" className="rounded-xl gap-2">
              <MapPin className="w-4 h-4" />
              <span className="hidden sm:inline">Доставка</span>
            </TabsTrigger>
            <TabsTrigger value="schedule" className="rounded-xl gap-2">
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">График</span>
            </TabsTrigger>
            <TabsTrigger value="account" className="rounded-xl gap-2">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Аккаунт</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="delivery" className="mt-4 px-2 space-y-4">
            <CourierActiveDeliveries />
          </TabsContent>

          <TabsContent value="schedule" className="mt-4 px-2">
            <CourierSchedule />
          </TabsContent>

          <TabsContent value="account" className="mt-4 px-2">
            <CourierAccount />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
