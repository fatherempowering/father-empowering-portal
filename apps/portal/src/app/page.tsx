import type { Metadata } from "next";

import { LandingPage } from "@/components/fe/landing/landing-page";
import { landingCopy, resolveLandingLocale } from "@/components/fe/landing/landing-copy";

type HomePageProps = Readonly<{
  searchParams: Promise<{ lang?: string | string[] }>;
}>;

export async function generateMetadata({
  searchParams,
}: HomePageProps): Promise<Metadata> {
  const locale = resolveLandingLocale((await searchParams).lang);
  return {
    title: "Father Empowering — The Legacy Protocol",
    description: landingCopy[locale].description,
  };
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const locale = resolveLandingLocale((await searchParams).lang);
  return <LandingPage locale={locale} />;
}
