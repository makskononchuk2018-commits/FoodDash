import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { BriefcaseBusiness, Loader2, LogIn, Send, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCourierApplication, useLogin, useRegisterCustomer } from "@/hooks/use-auth";

const CONSENT_COOKIE_NAME = "fd_cookie_consent";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLogin();
  const registerCustomer = useRegisterCustomer();
  const courierApplication = useCourierApplication();

  const [cookieConsent, setCookieConsent] = useState(false);
  const [applicationSent, setApplicationSent] = useState(false);

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    username: "",
    password: "",
    fullName: "",
    phone: "",
    email: "",
  });
  const [applicationForm, setApplicationForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    experience: "",
    comment: "",
  });

  useEffect(() => {
    const existing = document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${CONSENT_COOKIE_NAME}=`));

    setCookieConsent(existing ? existing.split("=")[1] === "1" : false);
  }, []);

  const setConsentCookie = (value: boolean) => {
    document.cookie = `${CONSENT_COOKIE_NAME}=${value ? 1 : 0}; path=/; max-age=${60 * 60 * 24 * 365}`;
  };

  const redirectByRole = (role: string) => {
    if (role === "admin") setLocation("/admin");
    else if (role === "courier") setLocation("/courier");
    else setLocation("/profile");
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      const result = await login.mutateAsync(loginForm);
      toast({ title: "Вход выполнен", description: `Добро пожаловать, ${result.user.fullName}` });
      redirectByRole(result.user.role);
    } catch (error) {
      toast({
        title: "Ошибка входа",
        description: error instanceof Error ? error.message : "Проверьте логин и пароль",
        variant: "destructive",
      });
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      const result = await registerCustomer.mutateAsync({
        ...registerForm,
        email: registerForm.email || null,
      });
      toast({ title: "Аккаунт создан", description: `Добро пожаловать, ${result.user.fullName}` });
      setLocation("/profile");
    } catch (error) {
      toast({
        title: "Не удалось зарегистрироваться",
        description: error instanceof Error ? error.message : "Проверьте данные",
        variant: "destructive",
      });
    }
  };

  const handleApplication = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      await courierApplication.mutateAsync({
        fullName: applicationForm.fullName,
        phone: applicationForm.phone,
        email: applicationForm.email || null,
        experience: applicationForm.experience || null,
        comment: applicationForm.comment || null,
      });
      setApplicationSent(true);
      toast({ title: "Заявка отправлена", description: "Администратор рассмотрит ее в панели управления." });
    } catch (error) {
      toast({
        title: "Не удалось отправить заявку",
        description: error instanceof Error ? error.message : "Проверьте данные",
        variant: "destructive",
      });
    }
  };

  const cookieConsentBlock = (
    <div className="rounded-xl bg-muted p-3">
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={cookieConsent}
          onChange={(event) => {
            setCookieConsent(event.target.checked);
            setConsentCookie(event.target.checked);
          }}
          className="mt-1"
          aria-label="Согласие на использование файлов cookie"
        />
        <span>
          Я согласен(на) на использование файлов cookie
          <span className="mt-1 block text-xs">
            <a href="/cookie-policy.html" target="_blank" rel="noreferrer" className="underline">
              Политика использования файлов cookie
            </a>
          </span>
        </span>
      </label>
    </div>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-3 sm:p-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg">
        <Card className="overflow-hidden rounded-2xl border-none shadow-2xl">
          <CardHeader className="bg-primary p-6 text-center text-white sm:p-8">
            <CardTitle className="text-2xl font-display font-bold sm:text-3xl">FoodDash</CardTitle>
            <CardDescription className="text-primary-foreground/80">Вход, регистрация и заявки курьеров</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid h-12 w-full grid-cols-3 rounded-xl">
                <TabsTrigger value="login" className="gap-1 rounded-lg px-2 text-xs sm:gap-2 sm:text-sm">
                  <LogIn className="h-4 w-4" />
                  Вход
                </TabsTrigger>
                <TabsTrigger value="register" className="gap-1 rounded-lg px-2 text-xs sm:gap-2 sm:text-sm">
                  <UserPlus className="h-4 w-4" />
                  Клиент
                </TabsTrigger>
                <TabsTrigger value="courier" className="gap-1 rounded-lg px-2 text-xs sm:gap-2 sm:text-sm">
                  <BriefcaseBusiness className="h-4 w-4" />
                  Курьер
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-6">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-username">Имя пользователя</Label>
                    <Input
                      id="login-username"
                      required
                      className="h-12 rounded-xl"
                      value={loginForm.username}
                      onChange={(event) => setLoginForm((prev) => ({ ...prev, username: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Пароль</Label>
                    <Input
                      id="login-password"
                      type="password"
                      required
                      className="h-12 rounded-xl"
                      value={loginForm.password}
                      onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                    />
                  </div>
                  {cookieConsentBlock}
                  <Button type="submit" className="h-12 w-full rounded-xl text-lg" disabled={login.isPending || !cookieConsent}>
                    {login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Войти"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-6">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="reg-username">Логин</Label>
                      <Input
                        id="reg-username"
                        required
                        minLength={3}
                        className="rounded-xl"
                        value={registerForm.username}
                        onChange={(event) => setRegisterForm((prev) => ({ ...prev, username: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-password">Пароль</Label>
                      <Input
                        id="reg-password"
                        required
                        minLength={6}
                        type="password"
                        className="rounded-xl"
                        value={registerForm.password}
                        onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-name">ФИО</Label>
                    <Input
                      id="reg-name"
                      required
                      className="rounded-xl"
                      value={registerForm.fullName}
                      onChange={(event) => setRegisterForm((prev) => ({ ...prev, fullName: event.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="reg-phone">Телефон</Label>
                      <Input
                        id="reg-phone"
                        required
                        className="rounded-xl"
                        value={registerForm.phone}
                        onChange={(event) => setRegisterForm((prev) => ({ ...prev, phone: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-email">Email</Label>
                      <Input
                        id="reg-email"
                        type="email"
                        className="rounded-xl"
                        value={registerForm.email}
                        onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                      />
                    </div>
                  </div>
                  {cookieConsentBlock}
                  <Button
                    type="submit"
                    className="h-12 w-full rounded-xl text-lg"
                    disabled={registerCustomer.isPending || !cookieConsent}
                  >
                    {registerCustomer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Зарегистрироваться"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="courier" className="mt-6">
                {applicationSent ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center text-emerald-900">
                    <Send className="mx-auto mb-3 h-8 w-8" />
                    <p className="font-semibold">Заявка отправлена</p>
                    <p className="mt-1 text-sm">Курьерский аккаунт создаст администратор после проверки.</p>
                    <Button variant="outline" className="mt-4 rounded-xl" onClick={() => setApplicationSent(false)}>
                      Отправить еще одну заявку
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleApplication} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="app-name">ФИО</Label>
                      <Input
                        id="app-name"
                        required
                        className="rounded-xl"
                        value={applicationForm.fullName}
                        onChange={(event) => setApplicationForm((prev) => ({ ...prev, fullName: event.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="app-phone">Телефон</Label>
                        <Input
                          id="app-phone"
                          required
                          className="rounded-xl"
                          value={applicationForm.phone}
                          onChange={(event) => setApplicationForm((prev) => ({ ...prev, phone: event.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="app-email">Email</Label>
                        <Input
                          id="app-email"
                          type="email"
                          className="rounded-xl"
                          value={applicationForm.email}
                          onChange={(event) => setApplicationForm((prev) => ({ ...prev, email: event.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="app-experience">Опыт работы</Label>
                      <Textarea
                        id="app-experience"
                        rows={3}
                        value={applicationForm.experience}
                        onChange={(event) => setApplicationForm((prev) => ({ ...prev, experience: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="app-comment">Комментарий</Label>
                      <Textarea
                        id="app-comment"
                        rows={3}
                        value={applicationForm.comment}
                        onChange={(event) => setApplicationForm((prev) => ({ ...prev, comment: event.target.value }))}
                      />
                    </div>
                    <Button type="submit" className="h-12 w-full rounded-xl text-lg" disabled={courierApplication.isPending}>
                      {courierApplication.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Отправить заявку"}
                    </Button>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
