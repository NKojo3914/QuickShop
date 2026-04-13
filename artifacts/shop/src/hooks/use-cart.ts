import { useState, useEffect, useCallback } from "react";

export interface CartItem {
  id: number;
  name: string;
  price: string;
  imageUrl?: string | null;
  quantity: number;
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
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((id: number) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: number, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.id !== id));
    } else {
      setItems(prev => prev.map(i => i.id === id ? { ...i, quantity } : i));
    }
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return { items, addItem, removeItem, updateQuantity, clearCart, totalItems };
}
