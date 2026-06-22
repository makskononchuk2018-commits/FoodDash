import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema, type InsertProduct, type Product } from "@shared/schema";
import { useCreateProduct, useUpdateProduct } from "@/hooks/use-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Upload, Image as ImageIcon } from "lucide-react";
import { DialogFooter } from "@/components/ui/dialog";
import { z } from "zod";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface ProductFormProps {
  product?: Product;
  onSuccess: () => void;
}

// Extend schema for form validation if needed, e.g. coercive types
const formSchema = insertProductSchema.extend({
  price: z.coerce.string(), // Input type number returns string often, handle it
  stock: z.coerce.number(),
});

export function ProductForm({ product, onSuccess }: ProductFormProps) {
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const isEditing = !!product;
  const [uploading, setUploading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<{ filename: string; url: string }[]>([]);
  const [showImageSelector, setShowImageSelector] = useState(false);
  const { toast } = useToast();

  const form = useForm<InsertProduct>({
    resolver: zodResolver(formSchema),
    defaultValues: product ? {
      ...product,
      price: product.price.toString(),
      stock: product.stock,
    } : {
      name: "",
      description: "",
      price: "0",
      stock: 0,
      category: "Main",
      imageUrl: "",
    },
  });

  useEffect(() => {
    fetchUploadedImages();
  }, []);

  const fetchUploadedImages = async () => {
    try {
      const res = await fetch("/api/uploaded-images", { credentials: "include" });
      if (res.ok) {
        setUploadedImages(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch images:", error);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        form.setValue("imageUrl", data.url);
        toast({ title: "Изображение загружено" });
        await fetchUploadedImages();
        setShowImageSelector(false);
      } else {
        toast({ title: "Ошибка загрузки", description: "Проверьте размер и формат файла" });
      }
    } catch (error) {
      toast({ title: "Ошибка", description: "Не удалось загрузить изображение" });
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data: InsertProduct) => {
    try {
      if (isEditing && product) {
        await updateMutation.mutateAsync({ id: product.id, ...data });
      } else {
        await createMutation.mutateAsync(data);
      }
      onSuccess();
    } catch (error) {
      console.error(error);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Название товара</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Spicy Chicken Bowl" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Цена ($)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="stock"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Количество на складе</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Категория</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Main, Side, Drink" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="imageUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Изображение товара</FormLabel>
              <div className="space-y-3">
                {field.value && (
                  <div className="relative w-full h-32 rounded-lg overflow-hidden bg-gray-100">
                    <img src={field.value} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowImageSelector(!showImageSelector)}
                    className="flex-1"
                  >
                    <ImageIcon className="w-4 h-4 mr-2" />
                    Выбрать из загруженных
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={uploading}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById("image-file-input")?.click();
                    }}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {uploading ? "Загрузка..." : "Загрузить"}
                  </Button>
                  <input
                    id="image-file-input"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </div>

                {showImageSelector && uploadedImages.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-3 p-2 bg-gray-50 rounded-lg max-h-40 overflow-y-auto">
                    {uploadedImages.map((img) => (
                      <button
                        key={img.filename}
                        type="button"
                        onClick={() => {
                          form.setValue("imageUrl", img.url);
                          setShowImageSelector(false);
                        }}
                        className="relative rounded overflow-hidden hover:opacity-75 transition-opacity"
                      >
                        <img src={img.url} alt={img.filename} className="w-full h-20 object-cover" />
                      </button>
                    ))}
                  </div>
                )}

                <FormControl>
                  <Input
                    placeholder="или введите URL изображения"
                    value={field.value}
                    onChange={field.onChange}
                    className="text-sm"
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Описание</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe the dish..."
                  className="resize-none"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter className="pt-4">
          <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEditing ? "Обновить товар" : "Создать товар"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
