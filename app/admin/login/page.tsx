import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="max-w-sm mx-auto mt-16 rounded-2xl border border-line bg-card p-6">
      <h1 className="font-heading text-2xl mb-4">Admin login</h1>
      <LoginForm />
    </div>
  );
}
