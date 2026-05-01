import { useState, useEffect, useCallback } from "react";

export interface CartItem {
  id: number;
  name: string;
  price: string;
  imageUrl?: string | null;
  quantity: number;
  /** Variant label (e.g. "M", "42", "Red"). Undefined = no variant selected */
  variantLabel?: string;
}

/** Unique key per product+variant combination */
function itemKey(id: number, variantLabel?: string) {
  return variantLabel ? `${id}:${variantLabel}` : `${id}`;
}

const STORAGE_KEY = "qs_cart";

function loadCart(storeSlug: string): CartItem[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${storeSlug}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(storeSlug: string, items: CartItem[]) {
  localStorage.setItem(`${STORAGE_KEY}_${storeSlug}`, JSON.stringify(items));
}

export function useCart(storeSlug: string) {
  const [items, setItems] = useState<CartItem[]>(() => loadCart(storeSlug));

  useEffect(() => {
    saveCart(storeSlug, items);
  }, [items, storeSlug]);

  const addItem = useCallback((product: Omit<CartItem, "quantity">) => {
    setItems(prev => {
      const key = itemKey(product.id, product.variantLabel);
      const existing = prev.find(i => itemKey(i.id, i.variantLabel) === key);
      if (existing) {
        return prev.map(i =>
          itemKey(i.id, i.variantLabel) === key ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((id: number, variantLabel?: string) => {
    const key = itemKey(id, variantLabel);
    setItems(prev => prev.filter(i => itemKey(i.id, i.variantLabel) !== key));
  }, []);

  const updateQuantity = useCallback((id: number, quantity: number, variantLabel?: string) => {
    const key = itemKey(id, variantLabel);
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => itemKey(i.id, i.variantLabel) !== key));
    } else {
      setItems(prev => prev.map(i =>
        itemKey(i.id, i.variantLabel) === key ? { ...i, quantity } : i
      ));
    }
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return { items, addItem, removeItem, updateQuantity, clearCart, totalItems };
}
