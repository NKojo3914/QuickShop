import { useState } from "react";
import {
  Package,
  MessageCircle,
  CircleCheck,
  CheckCircle2,
  Clock,
  User,
  Phone,
  PackageX,
  Truck,
  Banknote,
  Loader2,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Order as BaseOrder } from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// The DB has more fields than the generated OpenAPI Order type — extend it
// here so we can render payment / escrow state without regenerating.
type Order = BaseOrder & {
  customerPhone?: string | null;
  source?: string | null;
  amount?: string | null;
  deliveryFee?: string | null;
  platformFee?: string | null;
  totalCharged?: string | null;
  currency?: string | null;
  paymentStatus?: string | null;
  paidAt?: string | null;
  shippedAt?: string | null;
  receivedAt?: string | null;
  releasedAt?: string | null;
  payoutStatus?: string | null;
  deliveryCode?: string | null;
  deliveryCodeVerifiedAt?: string | null;
  autoReleaseAt?: string | null;
  refundedAt?: string | null;
  refundReference?: string | null;
};

function orderRef(id: number) {
  return `QS-${String(id).padStart(4, "0")}`;
}

function PaymentBadge({ order }: { order: Order }) {
  const status = order.paymentStatus || "unpaid";
  const cur = order.currency || "GHS";
  const amt = order.amount;
  if (status === "paid") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center gap-1">
        <ShieldCheck className="w-2.5 h-2.5" /> Paid {amt ? `${cur} ${amt}` : ""}
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400">
        Awaiting payment
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Payment failed
      </span>
    );
  }
  return null; // "unpaid" — show nothing (legacy non-escrow orders)
}

export interface OrdersSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: Order[] | undefined;
  isOrdersLoading: boolean;
  expandedOrderId: number | null;
  setExpandedOrderId: (id: number | null) => void;
  onUpdateOrderStatus: (orderId: number, status: string) => void;
  isUpdatePending: boolean;
  onLogOrderOpen: () => void;
  onShipOrder?: (orderId: number) => void;
  onVerifyDelivery?: (orderId: number, code: string) => void;
  shippingOrderId?: number | null;
  verifyingOrderId?: number | null;
  storeCurrency?: string | null;
}

export function OrdersSidebar({
  open,
  onOpenChange,
  orders,
  isOrdersLoading,
  expandedOrderId,
  setExpandedOrderId,
  onUpdateOrderStatus,
  isUpdatePending,
  onLogOrderOpen,
  onShipOrder,
  onVerifyDelivery,
  shippingOrderId,
  verifyingOrderId,
  storeCurrency,
}: OrdersSidebarProps) {
  const [deliveryCodes, setDeliveryCodes] = useState<Record<number, string>>({});
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col [&>button:first-of-type]:hidden">
        <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl font-serif flex items-center gap-2">
              <Package className="w-5 h-5" /> Orders
              {orders && orders.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {orders.length}
                </Badge>
              )}
            </SheetTitle>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full text-xs gap-1.5 text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950/40"
              onClick={onLogOrderOpen}
            >
              <MessageCircle className="w-3.5 h-3.5" /> Log WA Order
            </Button>
          </div>
        </SheetHeader>

        {isOrdersLoading ? (
          <div className="space-y-3 px-5 pt-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <Tabs defaultValue="pending" className="flex flex-col flex-1 min-h-0">
            <TabsList className="mx-5 mt-4 shrink-0">
              <TabsTrigger value="pending" className="flex-1 gap-1.5">
                Pending
                {(orders?.filter(o => o.status === "pending").length ?? 0) > 0 && (
                  <Badge className="h-4 px-1 text-[10px] bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                    {orders!.filter(o => o.status === "pending").length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="confirmed" className="flex-1 gap-1.5">
                Confirmed
                {(orders?.filter(o => o.status === "confirmed").length ?? 0) > 0 && (
                  <Badge className="h-4 px-1 text-[10px] bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">
                    {orders!.filter(o => o.status === "confirmed").length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
            </TabsList>

            {/* Pending tab */}
            <TabsContent value="pending" className="flex-1 overflow-y-auto px-5 pt-4 pb-6 mt-0">
              {!orders?.filter(o => o.status === "pending").length ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
                    <CircleCheck className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="font-medium text-foreground mb-1">All caught up!</p>
                  <p className="text-sm text-muted-foreground">No pending orders right now.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orders!.filter(o => o.status === "pending").map(order => (
                    <div key={order.id} className="bg-card border rounded-xl p-3.5 flex flex-col gap-2 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="font-semibold text-sm text-foreground truncate">{order.customerName || "Customer"}</span>
                          </div>
                          {order.customerPhone && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 ml-5">
                              <Phone className="w-2.5 h-2.5" />{order.customerPhone}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">Pending</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{orderRef(order.id)}</span>
                          <PaymentBadge order={order} />
                        </div>
                      </div>
                      <p
                        className={`text-xs text-muted-foreground cursor-pointer ${expandedOrderId === order.id ? "" : "line-clamp-2"}`}
                        onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                      >{order.summary}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
                          <Clock className="w-3 h-3" />{new Date(order.createdAt).toLocaleString()}
                        </span>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="outline"
                            className="h-7 text-xs rounded-full px-3 text-red-500 border-red-200 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                            onClick={() => onUpdateOrderStatus(order.id, "cancelled")}
                            disabled={isUpdatePending}>
                            <PackageX className="w-3 h-3 mr-1" /> Cancel
                          </Button>
                          <Button size="sm" variant="outline"
                            className="h-7 text-xs rounded-full px-3 text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                            onClick={() => onUpdateOrderStatus(order.id, "confirmed")}
                            disabled={isUpdatePending}>
                            <CircleCheck className="w-3 h-3 mr-1" /> Confirm
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Confirmed tab */}
            <TabsContent value="confirmed" className="flex-1 overflow-y-auto px-5 pt-4 pb-6 mt-0">
              {!orders?.filter(o => o.status === "confirmed").length ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
                    <Package className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="font-medium text-foreground mb-1">Nothing confirmed yet</p>
                  <p className="text-sm text-muted-foreground">Confirm pending orders to see them here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orders!.filter(o => o.status === "confirmed").map(order => {
                    const isPaid = order.paymentStatus === "paid";
                    const isShipped = !!order.shippedAt;
                    const isReleased = !!order.releasedAt;
                    const isShipping = shippingOrderId === order.id;
                    const isVerifying = verifyingOrderId === order.id;
                    const cur = order.currency || storeCurrency || "GHS";
                    return (
                    <div key={order.id} className="bg-card border rounded-xl p-3.5 flex flex-col gap-2 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="font-semibold text-sm text-foreground truncate">{order.customerName || "Customer"}</span>
                          </div>
                          {order.customerPhone && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 ml-5">
                              <Phone className="w-2.5 h-2.5" />{order.customerPhone}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">Confirmed</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{orderRef(order.id)}</span>
                          <PaymentBadge order={order} />
                          {isShipped && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 flex items-center gap-1">
                              <Truck className="w-2.5 h-2.5" /> Shipped
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Pricing breakdown for escrow orders */}
                      {isPaid && order.amount && (
                        <div className="text-[10px] text-muted-foreground bg-muted/40 rounded-lg px-2.5 py-1.5 space-y-0.5">
                          <div className="flex justify-between"><span>Item</span><span>{cur} {parseFloat(order.amount as unknown as string).toFixed(2)}</span></div>
                          {order.deliveryFee && parseFloat(order.deliveryFee as unknown as string) > 0 && (
                            <div className="flex justify-between"><span>Delivery</span><span>{cur} {parseFloat(order.deliveryFee as unknown as string).toFixed(2)}</span></div>
                          )}
                          {order.platformFee && (
                            <div className="flex justify-between"><span>Platform fee (1%)</span><span>{cur} {parseFloat(order.platformFee as unknown as string).toFixed(2)}</span></div>
                          )}
                          {order.totalCharged && (
                            <div className="flex justify-between font-semibold border-t border-border/50 pt-0.5 mt-0.5">
                              <span>Total paid</span><span>{cur} {parseFloat(order.totalCharged as unknown as string).toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      )}

                      <p
                        className={`text-xs text-muted-foreground cursor-pointer ${expandedOrderId === order.id ? "" : "line-clamp-2"}`}
                        onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                      >{order.summary}</p>

                      {/* Delivery code entry — shows after shipping, before release */}
                      {isPaid && isShipped && !isReleased && onVerifyDelivery && (
                        <div className="flex gap-1.5 items-center pt-1">
                          <div className="relative flex-1">
                            <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                              className="h-8 text-sm pl-8 font-mono tracking-widest"
                              placeholder="6-digit code"
                              maxLength={6}
                              value={deliveryCodes[order.id] || ""}
                              onChange={e => setDeliveryCodes(prev => ({ ...prev, [order.id]: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                            />
                          </div>
                          <Button
                            size="sm"
                            className="h-8 text-xs rounded-full px-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => onVerifyDelivery(order.id, deliveryCodes[order.id] || "")}
                            disabled={isVerifying || (deliveryCodes[order.id] || "").length !== 6}>
                            {isVerifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Banknote className="w-3 h-3 mr-1" />Release</>}
                          </Button>
                        </div>
                      )}
                      {isPaid && isReleased && (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck className="w-3.5 h-3.5" /> Funds released to seller
                        </div>
                      )}

                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
                          <Clock className="w-3 h-3" />{new Date(order.createdAt).toLocaleString()}
                        </span>
                        <div className="flex gap-1.5 flex-wrap">
                          {isPaid && !isShipped && onShipOrder && (
                            <Button size="sm" variant="outline"
                              className="h-7 text-xs rounded-full px-3 text-indigo-600 border-indigo-300 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                              onClick={() => onShipOrder(order.id)}
                              disabled={isShipping}>
                              {isShipping ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Truck className="w-3 h-3 mr-1" />}
                              Mark Shipped
                            </Button>
                          )}
                          {!isPaid && (
                            <>
                              <Button size="sm" variant="outline"
                                className="h-7 text-xs rounded-full px-3 text-red-500 border-red-200 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                                onClick={() => onUpdateOrderStatus(order.id, "cancelled")}
                                disabled={isUpdatePending}>
                                <PackageX className="w-3 h-3 mr-1" /> Cancel
                              </Button>
                              <Button size="sm" variant="outline"
                                className="h-7 text-xs rounded-full px-3 text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/40"
                                onClick={() => onUpdateOrderStatus(order.id, "completed")}
                                disabled={isUpdatePending}>
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Complete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* History tab */}
            <TabsContent value="history" className="flex-1 overflow-y-auto px-5 pt-4 pb-6 mt-0">
              {!orders?.filter(o => o.status === "completed" || o.status === "cancelled").length ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="font-medium text-foreground mb-1">No history yet</p>
                  <p className="text-sm text-muted-foreground">Completed and cancelled orders will appear here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orders!.filter(o => o.status === "completed" || o.status === "cancelled").map(order => (
                    <div key={order.id} className="bg-card border rounded-xl p-3.5 flex flex-col gap-2 shadow-sm opacity-80">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="font-semibold text-sm text-foreground truncate">{order.customerName || "Customer"}</span>
                          </div>
                          {order.customerPhone && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 ml-5">
                              <Phone className="w-2.5 h-2.5" />{order.customerPhone}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {order.status === "cancelled" ? (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 flex items-center gap-1">
                              <PackageX className="w-3 h-3" /> Cancelled
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-muted-foreground">{orderRef(order.id)}</span>
                          {order.releasedAt && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center gap-1">
                              <Banknote className="w-2.5 h-2.5" /> Paid out
                            </span>
                          )}
                        </div>
                      </div>
                      <p
                        className={`text-xs text-muted-foreground cursor-pointer ${expandedOrderId === order.id ? "" : "line-clamp-2"}`}
                        onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                      >{order.summary}</p>
                      <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
                        <Clock className="w-3 h-3" />{new Date(order.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
