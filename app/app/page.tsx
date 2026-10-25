import Link from "next/link";
import localFont from "next/font/local";

const headingFont = localFont({
  src: "../public/fonts/CalSans-SemiBold.woff2",
});

const features = [
  {
    number: "01",
    title: "Random video chat",
    description:
      "Start a live video conversation with someone new through the existing matchmaking experience.",
    icon: "video",
  },
  {
    number: "02",
    title: "Text when you want",
    description:
      "Use text chat alongside your call to keep the conversation moving naturally.",
    icon: "chat",
  },
  {
    number: "03",
    title: "Skip at your pace",
    description:
      "When a conversation is not the right fit, skip and look for a new connection.",
    icon: "arrow",
  },
];

function FeatureIcon({ icon }: { icon: string }) {
  if (icon === "video") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
        <path d="M15.5 8.5h2.25l3.25-2v11l-3.25-2H15.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="3" y="6.5" width="12.5" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }

  if (icon === "chat") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
        <path d="M5.25 18.25 3.5 21l4.2-1.3c.74.2 1.51.3 2.3.3h4.5c3.59 0 6.5-2.6 6.5-5.8S18.09 8.4 14.5 8.4H9.25c-3.17 0-5.75 2.2-5.75 4.9 0 1.93.99 3.67 2.75 4.95Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 13.5h.01M12 13.5h.01M16 13.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
      <path d="M5 12h13M13 7l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 5v3M5 16v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function Page() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#070914] font-sans text-white">
      <div className="relative isolate">
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[-18rem] -z-10 h-[38rem] w-[58rem] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div aria-hidden="true" className="pointer-events-none absolute right-[-20rem] top-[24rem] -z-10 h-[34rem] w-[34rem] rounded-full bg-blue-600/15 blur-[120px]" />

        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-10" aria-label="Primary navigation">
          <Link href="/" className="group flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#070914]">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08] shadow-[0_0_30px_rgba(129,92,246,0.22)] transition duration-300 group-hover:border-fuchsia-300/50 group-hover:bg-fuchsia-300/10">
              <span className="h-3 w-3 rounded-full bg-gradient-to-br from-fuchsia-300 to-blue-400 shadow-[0_0_16px_rgba(217,70,239,0.9)]" />
            </span>
            <span className={`${headingFont.className} text-xl tracking-tight sm:text-2xl`}>Talk-Now</span>
          </Link>

          <div className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
            <Link href="#features" className="transition hover:text-white focus:outline-none focus-visible:text-white">Features</Link>
            <Link href="#how-it-works" className="transition hover:text-white focus:outline-none focus-visible:text-white">How it works</Link>
            <Link href="#safety" className="transition hover:text-white focus:outline-none focus-visible:text-white">Safety &amp; privacy</Link>
          </div>

          <Link href="/meet" className="rounded-full border border-white/15 bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/10 transition hover:border-fuchsia-300/50 hover:bg-white/[0.14] focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#070914]">
            Start chatting
          </Link>
        </nav>

        <section className="mx-auto grid w-full max-w-7xl items-center gap-16 px-5 pb-24 pt-12 sm:px-8 md:pb-32 md:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:pt-28" aria-labelledby="hero-heading">
          <div className="max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-fuchsia-300/20 bg-fuchsia-300/[0.08] px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-100 shadow-[0_0_35px_rgba(217,70,239,0.1)]">
              <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-300 shadow-[0_0_10px_rgba(232,121,249,0.9)]" />
              Meet someone new
            </div>
            <h1 id="hero-heading" className={`${headingFont.className} max-w-3xl text-5xl leading-[0.98] tracking-[-0.04em] text-white sm:text-7xl lg:text-[5.5rem]`}>
              A new conversation is closer than you think.
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
              Talk-Now brings spontaneous video conversations and real text chat together in one simple place. Start a conversation, see where it goes, and keep moving when it is time for something new.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/meet" className="group inline-flex items-center justify-center gap-3 rounded-full bg-gradient-to-r from-fuchsia-500 to-blue-500 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_40px_rgba(129,92,246,0.3)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_48px_rgba(129,92,246,0.42)] focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-200 focus-visible:ring-offset-4 focus-visible:ring-offset-[#070914]">
                Start chatting
                <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </Link>
              <Link href="#how-it-works" className="inline-flex items-center justify-center rounded-full px-6 py-3.5 text-sm font-semibold text-slate-300 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#070914]">
                See how it works
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl" aria-label="Illustration of a Talk-Now video chat" role="img">
            <div aria-hidden="true" className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-fuchsia-500/20 via-blue-500/10 to-transparent blur-2xl" />
            <div className="relative rounded-[2rem] border border-white/15 bg-white/[0.07] p-3 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-4">
              <div className="flex items-center justify-between border-b border-white/10 px-2 pb-3 sm:px-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-fuchsia-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/30" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Live conversation</span>
              </div>
              <div className="grid gap-3 pt-3 sm:grid-cols-[1.35fr_0.65fr]">
                <div className="relative min-h-[17rem] overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500/70 via-violet-500/45 to-fuchsia-500/30">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_32%,rgba(255,255,255,0.25),transparent_20%),linear-gradient(135deg,transparent_45%,rgba(8,10,25,0.35))]" />
                  <div className="absolute bottom-4 left-4 rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-xs text-white/80 backdrop-blur-md">Your camera</div>
                  <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-white/10 shadow-[0_0_60px_rgba(255,255,255,0.18)] backdrop-blur-sm" />
                </div>
                <div className="flex min-h-[17rem] flex-col justify-between rounded-2xl border border-white/10 bg-[#10152b] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Stranger</span>
                    <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.8)]" />
                  </div>
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-400/30 to-fuchsia-400/20 ring-1 ring-white/10">
                    <span className="h-8 w-8 rounded-full bg-white/20" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-2 w-2/3 rounded-full bg-white/10" />
                    <div className="h-2 w-1/2 rounded-full bg-white/10" />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between px-2 pt-4 sm:px-3">
                <div className="flex items-center gap-2 text-xs text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Connection ready</div>
                <div className="flex gap-2"><span className="h-8 w-8 rounded-full border border-white/10 bg-white/5" /><span className="h-8 w-14 rounded-full bg-gradient-to-r from-fuchsia-500/70 to-blue-500/70" /></div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto w-full max-w-7xl scroll-mt-8 px-5 pb-24 sm:px-8 md:pb-32 lg:px-10" aria-labelledby="features-heading">
          <div className="mb-9 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Built for real conversations</p>
              <h2 id="features-heading" className={`${headingFont.className} mt-3 text-3xl tracking-tight text-white sm:text-4xl`}>Everything you need to say hello.</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-slate-400">A focused experience for meeting someone new without adding friction between you and the conversation.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.number} className="group rounded-3xl border border-white/10 bg-white/[0.045] p-6 transition duration-300 hover:-translate-y-1 hover:border-fuchsia-300/30 hover:bg-white/[0.07]">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-400/20 to-blue-400/20 text-fuchsia-200 ring-1 ring-white/10"><FeatureIcon icon={feature.icon} /></div>
                  <span className="text-xs font-semibold tracking-[0.2em] text-slate-500">{feature.number}</span>
                </div>
                <h3 className="mt-8 text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="mx-auto grid w-full max-w-7xl scroll-mt-8 gap-12 px-5 pb-24 sm:px-8 md:pb-32 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-10" aria-labelledby="how-heading">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-300">Keep it simple</p>
            <h2 id="how-heading" className={`${headingFont.className} mt-3 text-3xl tracking-tight text-white sm:text-4xl`}>From curious to connected in three steps.</h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-400">No complicated setup. Start when you are ready, let matchmaking find a stranger, and decide where the conversation goes.</p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-3">
            <li className="rounded-3xl border border-white/10 bg-[#0e1225] p-5"><span className="text-sm font-semibold text-fuchsia-300">01</span><h3 className="mt-12 font-semibold text-white">Start</h3><p className="mt-2 text-sm leading-6 text-slate-400">Open the chat and allow your camera when prompted.</p></li>
            <li className="rounded-3xl border border-white/10 bg-[#0e1225] p-5"><span className="text-sm font-semibold text-blue-300">02</span><h3 className="mt-12 font-semibold text-white">Meet</h3><p className="mt-2 text-sm leading-6 text-slate-400">Wait while Talk-Now looks for a real conversation partner.</p></li>
            <li className="rounded-3xl border border-white/10 bg-[#0e1225] p-5"><span className="text-sm font-semibold text-violet-300">03</span><h3 className="mt-12 font-semibold text-white">Talk</h3><p className="mt-2 text-sm leading-6 text-slate-400">Use video and text chat, or skip whenever you choose.</p></li>
          </ol>
        </section>

        <section id="safety" className="mx-5 mb-24 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.03] px-6 py-8 shadow-2xl shadow-black/20 sm:mx-8 sm:px-10 md:mb-32 md:py-10 lg:mx-auto lg:max-w-7xl lg:px-12" aria-labelledby="safety-heading">
          <div className="flex flex-col gap-7 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Your conversation, your call</p>
              <h2 id="safety-heading" className={`${headingFont.className} mt-3 text-3xl tracking-tight text-white sm:text-4xl`}>Stay in control of every connection.</h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">Talk-Now keeps the interaction focused: you choose when to start, what to share, and when to move on. Review the existing terms before you begin.</p>
            </div>
            <Link href="/policy" className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-emerald-300/50 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#070914]">Read privacy &amp; terms <span aria-hidden="true" className="ml-2">↗</span></Link>
          </div>
        </section>

        <footer className="mx-auto flex w-full max-w-7xl flex-col gap-5 border-t border-white/10 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <Link href="/" className={`${headingFont.className} text-lg text-slate-300 transition hover:text-white focus:outline-none focus-visible:text-white`}>Talk-Now</Link>
          <div className="flex items-center gap-5"><Link href="#features" className="transition hover:text-white focus:outline-none focus-visible:text-white">Features</Link><Link href="/policy" className="transition hover:text-white focus:outline-none focus-visible:text-white">Privacy &amp; terms</Link><Link href="/meet" className="transition hover:text-white focus:outline-none focus-visible:text-white">Start chatting</Link></div>
          <p>Make a connection. Keep it human.</p>
        </footer>
      </div>
    </main>
  );
}

export default Page;
