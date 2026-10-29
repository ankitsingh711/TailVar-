import { redirect } from "next/navigation";
import { currentUser } from "@/lib/http";
import { homeFor } from "@/lib/page-auth";

export default async function Home() {
  const user = await currentUser();
  redirect(user ? homeFor(user.role) : "/login");
}
