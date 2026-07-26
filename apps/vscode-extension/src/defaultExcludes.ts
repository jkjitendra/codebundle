export const DEFAULT_EXCLUDES = [
  ".git/**", "node_modules/**", "dist/**", "build/**", "out/**", ".next/**", "coverage/**",
  ".venv/**", "venv/**", "**/__pycache__/**", "**pycache**/**", ".env", ".env.*", "*.pem", "*.key",
  "credentials.json", "service-account.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"
] as const;
