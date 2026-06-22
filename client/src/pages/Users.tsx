import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Loader2, Plus, RotateCcw, Save, Search, Trash2, UserRoundCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  type CourierApplicationListItem,
  useAdminUsers,
  useApproveCourierApplication,
  useCourierApplications,
  useCreateAdminUser,
  useDeleteAdminUser,
  useManagerContactAdmin,
  useRejectCourierApplication,
  useRestoreAdminUser,
  useUpdateAdminUser,
  useUpdateManagerContactAdmin,
} from "@/hooks/use-admin";
import type { UserRole } from "@shared/schema";

const ROLE_LABEL: Record<UserRole, string> = {
  customer: "Клиент",
  courier: "Курьер",
  admin: "Администратор",
};

export default function Users() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Пользователи</h1>
        <p className="text-muted-foreground">Аккаунты, заявки курьеров и контакт менеджера</p>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid h-12 w-full grid-cols-3 rounded-xl bg-white p-1 shadow-sm">
          <TabsTrigger value="users" className="rounded-lg">
            Пользователи
          </TabsTrigger>
          <TabsTrigger value="applications" className="rounded-lg">
            Заявки курьеров
          </TabsTrigger>
          <TabsTrigger value="contact" className="rounded-lg">
            Контакт
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="applications" className="mt-4">
          <CourierApplicationsTab />
        </TabsContent>
        <TabsContent value="contact" className="mt-4">
          <ManagerContactTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "deleted" | "all">("all");
  const [createForm, setCreateForm] = useState({
    username: "",
    password: "",
    role: "customer" as UserRole,
    fullName: "",
    email: "",
    phone: "",
  });
  const [editForm, setEditForm] = useState<Record<number, Partial<typeof createForm>>>({});

  const usersQuery = useAdminUsers({
    role: roleFilter === "all" ? undefined : roleFilter,
    status: statusFilter,
    search: search.trim() || undefined,
  });
  const createUser = useCreateAdminUser();
  const updateUser = useUpdateAdminUser();
  const deleteUser = useDeleteAdminUser();
  const restoreUser = useRestoreAdminUser();

  const handleCreate = async () => {
    try {
      await createUser.mutateAsync({
        ...createForm,
        email: createForm.email || null,
        phone: createForm.phone || null,
      });
      setCreateForm({ username: "", password: "", role: "customer", fullName: "", email: "", phone: "" });
      toast({ title: "Пользователь создан" });
    } catch (error) {
      toast({
        title: "Не удалось создать пользователя",
        description: error instanceof Error ? error.message : "Проверьте данные",
        variant: "destructive",
      });
    }
  };

  const handleSaveUser = async (id: number) => {
    const payload = editForm[id];
    if (!payload) return;

    try {
      await updateUser.mutateAsync({
        id,
        ...payload,
        email: payload.email === "" ? null : payload.email,
        phone: payload.phone === "" ? null : payload.phone,
      });
      setEditForm((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast({ title: "Изменения сохранены" });
    } catch (error) {
      toast({
        title: "Не удалось сохранить пользователя",
        description: error instanceof Error ? error.message : "Попробуйте еще раз",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserRoundCog className="h-5 w-5 text-primary" />
            Новый пользователь
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-7">
          <Input placeholder="Логин" value={createForm.username} onChange={(e) => setCreateForm((p) => ({ ...p, username: e.target.value }))} />
          <Input placeholder="Пароль" type="password" value={createForm.password} onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))} />
          <Input placeholder="ФИО" value={createForm.fullName} onChange={(e) => setCreateForm((p) => ({ ...p, fullName: e.target.value }))} />
          <Input placeholder="Email" value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} />
          <Input placeholder="Телефон" value={createForm.phone} onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value }))} />
          <select className="h-10 rounded-md border px-3 text-sm" value={createForm.role} onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value as UserRole }))}>
            <option value="customer">Клиент</option>
            <option value="courier">Курьер</option>
            <option value="admin">Администратор</option>
          </select>
          <Button onClick={handleCreate} disabled={createUser.isPending}>
            {createUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            Создать
          </Button>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Список пользователей</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Поиск по логину, ФИО, email" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="h-10 rounded-md border px-3 text-sm" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as UserRole | "all")}>
              <option value="all">Все роли</option>
              <option value="customer">Клиенты</option>
              <option value="courier">Курьеры</option>
              <option value="admin">Администраторы</option>
            </select>
            <select className="h-10 rounded-md border px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "active" | "deleted" | "all")}>
              <option value="all">Все статусы</option>
              <option value="active">Только активные</option>
              <option value="deleted">Только удаленные</option>
            </select>
          </div>

          {usersQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-2">ID</th>
                    <th className="py-2 pr-2">Логин</th>
                    <th className="py-2 pr-2">Роль</th>
                    <th className="py-2 pr-2">ФИО</th>
                    <th className="py-2 pr-2">Email</th>
                    <th className="py-2 pr-2">Телефон</th>
                    <th className="py-2 pr-2">Статус</th>
                    <th className="py-2 pr-2">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {usersQuery.data?.map((user) => {
                    const edited = editForm[user.id] || {};
                    return (
                      <tr key={user.id} className="border-b align-top">
                        <td className="py-2 pr-2">{user.id}</td>
                        <td className="py-2 pr-2">
                          <Input defaultValue={user.username} onChange={(e) => setEditForm((prev) => ({ ...prev, [user.id]: { ...prev[user.id], username: e.target.value } }))} />
                        </td>
                        <td className="py-2 pr-2">
                          <select className="h-10 rounded-md border px-2 text-sm" defaultValue={user.role} onChange={(e) => setEditForm((prev) => ({ ...prev, [user.id]: { ...prev[user.id], role: e.target.value as UserRole } }))}>
                            <option value="customer">Клиент</option>
                            <option value="courier">Курьер</option>
                            <option value="admin">Администратор</option>
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <Input defaultValue={user.fullName} onChange={(e) => setEditForm((prev) => ({ ...prev, [user.id]: { ...prev[user.id], fullName: e.target.value } }))} />
                        </td>
                        <td className="py-2 pr-2">
                          <Input defaultValue={user.email || ""} onChange={(e) => setEditForm((prev) => ({ ...prev, [user.id]: { ...prev[user.id], email: e.target.value } }))} />
                        </td>
                        <td className="py-2 pr-2">
                          <Input defaultValue={user.phone || ""} onChange={(e) => setEditForm((prev) => ({ ...prev, [user.id]: { ...prev[user.id], phone: e.target.value } }))} />
                        </td>
                        <td className="py-2 pr-2">
                          <Badge variant={user.isDeleted ? "destructive" : "secondary"}>{user.isDeleted ? "Удален" : "Активен"}</Badge>
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleSaveUser(user.id)} disabled={updateUser.isPending || Object.keys(edited).length === 0}>
                              <Save className="mr-1 h-4 w-4" />
                              Сохранить
                            </Button>
                            {!user.isDeleted ? (
                              <Button size="icon" variant="destructive" className="h-9 w-9" onClick={() => deleteUser.mutate(user.id)} disabled={deleteUser.isPending}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="secondary" className="h-9 w-9" onClick={() => restoreUser.mutate(user.id)} disabled={restoreUser.isPending}>
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CourierApplicationsTab() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const applications = useCourierApplications(status);

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BriefcaseBusiness className="h-5 w-5 text-primary" />
            Заявки курьеров
          </CardTitle>
          <select className="h-10 rounded-md border px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="pending">Новые</option>
            <option value="approved">Одобренные</option>
            <option value="rejected">Отклоненные</option>
            <option value="all">Все</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {applications.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : applications.data?.length ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {applications.data.map((application) => (
              <CourierApplicationCard key={application.id} application={application} />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">Заявок нет.</div>
        )}
      </CardContent>
    </Card>
  );
}

function CourierApplicationCard({ application }: { application: CourierApplicationListItem }) {
  const statusLabel = application.status === "pending" ? "Новая" : application.status === "approved" ? "Одобрена" : "Отклонена";

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{application.fullName}</p>
          <p className="text-sm text-muted-foreground">{application.phone}</p>
          {application.email ? <p className="text-sm text-muted-foreground">{application.email}</p> : null}
        </div>
        <Badge variant={application.status === "rejected" ? "destructive" : "secondary"}>{statusLabel}</Badge>
      </div>
      {application.experience ? (
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <p className="font-medium">Опыт</p>
          <p className="mt-1 text-muted-foreground">{application.experience}</p>
        </div>
      ) : null}
      {application.comment ? (
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <p className="font-medium">Комментарий кандидата</p>
          <p className="mt-1 text-muted-foreground">{application.comment}</p>
        </div>
      ) : null}
      {application.adminComment ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <p className="font-medium">Комментарий администратора</p>
          <p className="mt-1">{application.adminComment}</p>
        </div>
      ) : null}
      {application.status === "pending" ? <CourierApplicationActions application={application} /> : null}
    </div>
  );
}

function CourierApplicationActions({ application }: { application: CourierApplicationListItem }) {
  const { toast } = useToast();
  const approve = useApproveCourierApplication();
  const reject = useRejectCourierApplication();
  const suggestedUsername = useMemo(() => {
    const base = application.fullName
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, ".")
      .replace(/^\.+|\.+$/g, "");
    return base || `courier${application.id}`;
  }, [application.fullName, application.id]);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveForm, setApproveForm] = useState({
    username: suggestedUsername,
    password: "",
    adminComment: "",
  });
  const [rejectComment, setRejectComment] = useState("");

  const handleApprove = async () => {
    try {
      await approve.mutateAsync({
        id: application.id,
        username: approveForm.username,
        password: approveForm.password,
        adminComment: approveForm.adminComment || null,
      });
      toast({ title: "Заявка одобрена", description: "Курьерский аккаунт создан." });
      setApproveOpen(false);
    } catch (error) {
      toast({
        title: "Не удалось одобрить заявку",
        description: error instanceof Error ? error.message : "Попробуйте еще раз",
        variant: "destructive",
      });
    }
  };

  const handleReject = async () => {
    try {
      await reject.mutateAsync({ id: application.id, adminComment: rejectComment || null });
      toast({ title: "Заявка отклонена" });
      setRejectOpen(false);
    } catch (error) {
      toast({
        title: "Не удалось отклонить заявку",
        description: error instanceof Error ? error.message : "Попробуйте еще раз",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogTrigger asChild>
          <Button size="sm">Одобрить</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать аккаунт курьера</DialogTitle>
            <DialogDescription>{application.fullName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={approveForm.username} onChange={(e) => setApproveForm((p) => ({ ...p, username: e.target.value }))} placeholder="Логин" />
            <Input value={approveForm.password} onChange={(e) => setApproveForm((p) => ({ ...p, password: e.target.value }))} placeholder="Пароль" type="password" />
            <Textarea value={approveForm.adminComment} onChange={(e) => setApproveForm((p) => ({ ...p, adminComment: e.target.value }))} placeholder="Комментарий администратора" />
            <Button className="w-full" onClick={handleApprove} disabled={approve.isPending || approveForm.username.length < 3 || approveForm.password.length < 6}>
              {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Создать курьера"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="destructive">
            Отклонить
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отклонить заявку</DialogTitle>
            <DialogDescription>{application.fullName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} placeholder="Комментарий администратора" />
            <Button className="w-full" variant="destructive" onClick={handleReject} disabled={reject.isPending}>
              {reject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Отклонить заявку"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ManagerContactTab() {
  const { toast } = useToast();
  const managerContact = useManagerContactAdmin();
  const updateManagerContact = useUpdateManagerContactAdmin();
  const [managerForm, setManagerForm] = useState({
    label: "Связь с менеджером",
    telegramUrl: "https://max.ru/u/f9LHodD0cOKJyXx9spPr1Qc_3tGdWpdLED5xOB-SSjJw8Eo2vJyFCZjn0L4",
    telegramUsername: "fooddash_manager",
  });

  useEffect(() => {
    if (managerContact.data) {
      setManagerForm({
        label: managerContact.data.label,
        telegramUrl: managerContact.data.telegramUrl,
        telegramUsername: managerContact.data.telegramUsername || "",
      });
    }
  }, [managerContact.data]);

  const handleSave = async () => {
    try {
      await updateManagerContact.mutateAsync({
        label: managerForm.label,
        telegramUrl: managerForm.telegramUrl,
        telegramUsername: managerForm.telegramUsername || null,
      });
      toast({ title: "Контакт менеджера обновлен" });
    } catch (error) {
      toast({
        title: "Не удалось сохранить контакт",
        description: error instanceof Error ? error.message : "Попробуйте еще раз",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Контакт менеджера</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Input value={managerForm.label} onChange={(e) => setManagerForm((p) => ({ ...p, label: e.target.value }))} placeholder="Текст кнопки" />
        <Input value={managerForm.telegramUrl} onChange={(e) => setManagerForm((p) => ({ ...p, telegramUrl: e.target.value }))} placeholder="https://max.ru/..." />
        <Input value={managerForm.telegramUsername} onChange={(e) => setManagerForm((p) => ({ ...p, telegramUsername: e.target.value }))} placeholder="username" />
        <Button onClick={handleSave} disabled={updateManagerContact.isPending || managerContact.isLoading}>
          {updateManagerContact.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Сохранить
        </Button>
      </CardContent>
    </Card>
  );
}
