import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserPage } from "@/server/auth/session";
import { orderFromDoc, orderRef } from "@/server/services/order-core";
import { toOrderView } from "@/server/services/order-view";
import { OrderDetail } from "@/components/orders/order-detail";

export const metadata: Metadata = { title: "Order details", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserPage(`/account/orders/${id}`);
  const snap = await orderRef(id).get();
  // Ownership is enforced here: another customer's id is indistinguishable from a missing one.
  if (!snap.exists) notFound();
  const order = orderFromDoc(snap);
  if (order.userId !== user.uid) notFound();
  return (
    <div className="space-y-4">
      <Link href="/account/orders" className="text-sm text-maroon underline underline-offset-4">
        &larr; All orders
      </Link>
      <OrderDetail view={await toOrderView(order)} />
    </div>
  );
}
