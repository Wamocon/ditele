import "server-only";

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseServerEnvironment() {
  return {
    url: requireEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      requireEnvironmentVariable("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  } as const;
}

export function getSupabaseServiceRoleEnvironment() {
  return {
    url: requireEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: requireEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY"),
  } as const;
}

