// DEPRECATED: Trading view moved to /portfolio (live Alpaca data)
import { redirect } from "next/navigation";

export default function TradesPage() {
  redirect("/portfolio");
}
