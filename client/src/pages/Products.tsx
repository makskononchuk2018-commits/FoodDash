import { useState, useMemo, useRef } from "react";
import { useProducts, useDeleteProduct, useImportProducts, type ProductImportResult } from "@/hooks/use-products";
import { Loader2, Plus, Search, Edit2, Trash2, UtensilsCrossed, FileSpreadsheet, Download, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ProductForm } from "@/components/ProductForm";
import { api } from "@shared/routes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

const ITEMS_PER_PAGE = 12;

export default function Products() {
  const { data: products, isLoading } = useProducts();
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const filteredProducts = useMemo(() => 
    products?.filter(p => 
      p.name.toLowerCase().includes(search.toLowerCase()) || 
      p.category.toLowerCase().includes(search.toLowerCase())
    ) ?? [],
    [products, search]
  );

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = useMemo(() =>
    filteredProducts.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
    ),
    [filteredProducts, currentPage]
  );

  // Reset page when search changes
  const handleSearch = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Меню и товары</h1>
          <p className="text-muted-foreground">Управление ассортиментом и остатками</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <ProductImportDialog />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30">
                <Plus className="w-4 h-4 mr-2" /> Добавить блюдо
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Новый товар</DialogTitle>
                <DialogDescription>Создайте новую карточку товара для вашего меню.</DialogDescription>
              </DialogHeader>
              <ProductForm onSuccess={() => { setIsDialogOpen(false); toast({ title: "Товар создан" }); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
        <Input 
          className="pl-10 h-12 rounded-xl bg-white border-transparent shadow-sm focus-visible:ring-primary/20 transition-all hover:bg-white/80"
          placeholder="Поиск по названию или категории..." 
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between text-sm text-muted-foreground bg-muted/30 rounded-xl px-4 py-3">
        <span>Найдено товаров: <span className="font-bold text-foreground">{filteredProducts.length}</span></span>
        {totalPages > 1 && <span>Страница {currentPage} из {totalPages}</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {paginatedProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
        {paginatedProducts.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            Товары не найдены.
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-12">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="rounded-lg"
          >
            ← Назад
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(page)}
                className="rounded-lg min-w-10 h-10"
              >
                {page}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="rounded-lg"
          >
            Далее →
          </Button>
        </div>
      )}
    </div>
  );
}

function ProductImportDialog() {
  const importMutation = useImportProducts();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [markupPercent, setMarkupPercent] = useState(30);
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const { toast } = useToast();

  const handleTemplateDownload = async () => {
    try {
      const res = await fetch(api.products.importTemplate.path, { credentials: "include" });

      if (!res.ok) {
        throw new Error("Не удалось скачать шаблон");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "product-import-template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось скачать шаблон",
      });
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast({ title: "Выберите Excel-файл" });
      return;
    }

    try {
      const data = await importMutation.mutateAsync({ file: selectedFile, markupPercent });
      setResult(data);
      toast({
        title: "Импорт завершен",
        description: `Создано: ${data.created}, обновлено: ${data.updated}, пропущено: ${data.skipped}`,
      });
    } catch (error) {
      toast({
        title: "Ошибка импорта",
        description: error instanceof Error ? error.message : "Не удалось импортировать товары",
      });
    }
  };

  const resetState = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      setSelectedFile(null);
      setResult(null);
      setMarkupPercent(30);
      importMutation.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={resetState}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-xl bg-white shadow-sm">
          <FileSpreadsheet className="w-4 h-4 mr-2" /> Импорт Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Импорт поставки из Excel</DialogTitle>
          <DialogDescription>
            Загрузите файл с товарами, количеством, закупочной ценой и ссылками на фото.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={handleTemplateDownload} className="justify-start">
              <Download className="w-4 h-4 mr-2" /> Скачать шаблон
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="justify-start flex-1 min-w-0"
            >
              <UploadCloud className="w-4 h-4 mr-2" />
              <span className="truncate">{selectedFile ? selectedFile.name : "Выбрать файл поставки"}</span>
            </Button>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => {
                setSelectedFile(event.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="product-import-markup">Наценка по умолчанию, %</Label>
            <Input
              id="product-import-markup"
              type="number"
              min={0}
              max={1000}
              step={1}
              value={markupPercent}
              onChange={(event) => setMarkupPercent(Number(event.target.value))}
            />
          </div>

          {result && (
            <div className="rounded-xl bg-muted/40 p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <ImportStat label="Строк" value={result.totalRows} />
                <ImportStat label="Создано" value={result.created} />
                <ImportStat label="Обновлено" value={result.updated} />
                <ImportStat label="Пропущено" value={result.skipped} />
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Ошибки в строках</p>
                  <div className="max-h-32 overflow-y-auto space-y-1 text-sm text-muted-foreground">
                    {result.errors.slice(0, 8).map((error) => (
                      <p key={`${error.row}-${error.message}`}>
                        Строка {error.row}: {error.message}
                      </p>
                    ))}
                    {result.errors.length > 8 && (
                      <p>Еще ошибок: {result.errors.length - 8}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => resetState(false)}>
              Закрыть
            </Button>
            <Button type="button" onClick={handleImport} disabled={importMutation.isPending}>
              {importMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Импортировать
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function ProductCard({ product }: { product: any }) {
  const deleteMutation = useDeleteProduct();
  const { toast } = useToast();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const handleDelete = async () => {
    if (confirm("Вы уверены, что хотите удалить этот товар?")) {
      await deleteMutation.mutateAsync(product.id);
      toast({ title: "Товар удален" });
    }
  };

  return (
    <div className="group bg-white rounded-2xl border shadow-sm hover:shadow-xl hover:border-primary/20 transition-all duration-300 overflow-hidden flex flex-col">
      <div className="relative h-48 bg-secondary/30 overflow-hidden">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-secondary">
             <UtensilsCrossed className="w-12 h-12 opacity-20" />
          </div>
        )}
        <div className="absolute top-3 right-3 flex gap-2">
           <span className="bg-white/90 backdrop-blur text-foreground text-xs font-bold px-2 py-1 rounded-lg shadow-sm">
             {product.price} ₽
           </span>
        </div>
      </div>
      
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between mb-2">
          <div>
            <span className="text-xs font-medium text-primary uppercase tracking-wider">{product.category}</span>
            <h3 className="font-display font-bold text-lg leading-tight mt-1">{product.name}</h3>
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
          {product.description || "Описание отсутствует."}
        </p>
        
        <div className="flex items-center justify-between pt-4 border-t border-dashed">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${product.stock > 10 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {product.stock} в наличии
          </span>

          <div className="flex gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-muted">
                  <Edit2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Действия</DropdownMenuLabel>
                <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                  <DialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Edit2 className="mr-2 h-4 w-4" /> Изменить
                    </DropdownMenuItem>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Редактирование</DialogTitle>
                    </DialogHeader>
                    <ProductForm product={product} onSuccess={() => { setIsEditOpen(false); toast({ title: "Обновлено" }); }} />
                  </DialogContent>
                </Dialog>
                
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete}>
                  <Trash2 className="mr-2 h-4 w-4" /> Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
