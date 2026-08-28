const target = process.argv[2] ?? "http://127.0.0.1:3000";
const timeoutMs = Number(process.argv[3] ?? 60_000);
const deadline = Date.now() + timeoutMs;

while (Date.now() < deadline) {
  try {
    const response = await fetch(target, { redirect: "manual" });
    if (response.status < 500) process.exit(0);
  } catch {
    // The application is still starting.
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
}

throw new Error(`Application did not become ready within ${timeoutMs} ms: ${target}`);
