import { ShoppingCart, Trash2, Plus, Minus, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartItem } from "@/hooks/use-cart";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (id: number, quantity: number, variantLabel?: string) => void;
  onRemove: (id: number, variantLabel?: string) => void;
  onClear: () => void;
  storeName: string;
  whatsappNumber: string;
  telegramBotUsername?: string | null;
  currency: string;
}

export function CartDrawer({
  open,
  onClose,
  items,
  onUpdateQuantity,
  onRemove,
  onClear,
  storeName,
  whatsappNumber,
  telegramBotUsername,
  currency,
}: CartDrawerProps) {
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  const parsePrice = (price: string) => {
    const num = parseFloat(price.replace(/[^0-9.]/g, ""));
    return isNaN(num) ? 0 : num;
  };

  const itemSubtotal = (item: CartItem) => parsePrice(item.price) * item.quantity;

  const grandTotal = items.reduce((sum, i) => sum + itemSubtotal(i), 0);

  const formatTotal = (n: number) => `${currency} ${n.toFixed(2)}`;

  const buildOrderSummary = () =>
    items
      .map(i => {
        const label = i.variantLabel ? ` (${i.variantLabel})` : "";
        return `• ${i.name}${label} x${i.quantity} @ ${currency} ${i.price} = ${formatTotal(itemSubtotal(i))}`;
      })
      .join("\n")
      .concat(`\n\nTotal: ${formatTotal(grandTotal)}`);

  const handleWhatsAppCheckout = () => {
    if (!items.length) return;
    const summary = buildOrderSummary();
    const message = `Hi! I'd like to place an order from ${storeName}:\n\n${summary}\n\nPlease confirm availability and payment details.`;
    const number = whatsappNumber.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank");
    onClear();
    onClose();
  };

  const handleTelegramCheckout = () => {
    if (!telegramBotUsername || !items.length) return;
    const username = telegramBotUsername.replace(/^@/, "");
    // Encode cart as "id:qty" pairs (variant label passed separately in the bot conversation)
    const startPayload = encodeURIComponent(`cart_${items.map(i => `${i.id}x${i.quantity}`).join("_")}`);
    window.open(`https://t.me/${username}?start=${startPayload}`, "_blank");
    onClear();
    onClose();
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-card z-50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            <h2 className="font-serif font-bold text-lg">Your Cart</h2>
            {totalItems > 0 && (
              <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                {totalItems}
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <ShoppingCart className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">Your cart is empty</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Add some products to get started</p>
            </div>
          ) : (
            items.map(item => (
              <div key={`${item.id}:${item.variantLabel ?? ""}`} className="flex items-center gap-3 bg-muted/50 rounded-2xl p-3">
                {item.imageUrl ? (
                  <img
                    src={`/api/storage${item.imageUrl}`}
                    alt={item.name}
                    className="w-14 h-14 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-muted shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{item.name}</p>
                  {item.variantLabel && (
                    <p className="text-xs text-muted-foreground font-medium">
                      Size: {item.variantLabel}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <p className="text-muted-foreground text-xs">{item.price} each</p>
                  </div>
                  <p className="text-primary text-sm font-bold">{formatTotal(itemSubtotal(item))}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      onClick={() => onUpdateQuantity(item.id, item.quantity - 1, item.variantLabel)}
                      className="w-6 h-6 rounded-full bg-background border flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-medium w-4 text-center">{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQuantity(item.id, item.quantity + 1, item.variantLabel)}
                      className="w-6 h-6 rounded-full bg-background border flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => onRemove(item.id, item.variantLabel)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer / Checkout */}
        {items.length > 0 && (
          <div className="border-t px-6 py-5 space-y-3">
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-muted-foreground">{totalItems} item{totalItems !== 1 ? "s" : ""}</span>
              <span className="text-lg font-bold text-foreground">{formatTotal(grandTotal)}</span>
            </div>
            <Button
              onClick={handleWhatsAppCheckout}
              className="w-full rounded-2xl h-12 bg-[#25D366] hover:bg-[#1ebe5d] text-white"
              size="lg"
            >
              <MessageCircle className="w-5 h-5 mr-2" />
              Order via WhatsApp
            </Button>

            {telegramBotUsername && (
              <Button
                onClick={handleTelegramCheckout}
                variant="outline"
                className="w-full rounded-2xl h-12 border-blue-400 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                size="lg"
              >
                <Send className="w-4 h-4 mr-2" />
                Order via Telegram AI
              </Button>
            )}

            <button
              onClick={onClear}
              className="w-full text-xs text-muted-foreground hover:text-destructive transition-colors py-1"
            >
              Clear cart
            </button>
          </div>
        )}
      </div>
    </>
  );
}
