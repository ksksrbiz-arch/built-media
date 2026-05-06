import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="max-w-6xl mx-auto px-6">
      {/* Hero */}
      <section className="pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-navy-800/60 border border-navy-700 text-xs text-gold-300 mb-6">
          <span className="w-1.5 h-1.5 bg-gold-400 rounded-full animate-pulse" />
          One paste. Ten clips. Zero editing.
        </div>
        <h1 className="font-display text-5xl md:text-6xl font-bold leading-tight mb-6">
          Drop a video.<br />
          <span className="text-gold-400">Get scroll-stopping clips.</span>
        </h1>
        <p className="text-xl text-navy-200 max-w-2xl mx-auto mb-10">
          Built Media routes your source content through best-in-class AI clipping engines,
          adds captions, and ships finished posts to Instagram and Facebook on autopilot.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/auth" className="btn-primary text-lg px-8 py-4">
            Start free →
          </Link>
          <Link to="/pricing" className="btn-secondary text-lg px-8 py-4">
            See pricing
          </Link>
        </div>
        <p className="text-xs text-navy-400 mt-6">3 free clips. No credit card.</p>
      </section>

      {/* How it works */}
      <section className="py-16 grid md:grid-cols-3 gap-6">
        {[
          { n: '01', title: 'Paste a URL', body: 'YouTube, podcast, livestream, recording — anything with a video.' },
          { n: '02', title: 'AI does the work', body: 'We route your video through the best clipping engine, auto-caption it, and pick the highest-virality moments.' },
          { n: '03', title: 'Schedule + ship', body: 'Download the MP4s or post directly to Instagram & Facebook from your dashboard.' },
        ].map((step) => (
          <div key={step.n} className="card">
            <div className="text-gold-400 font-display font-bold text-sm mb-3">{step.n}</div>
            <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
            <p className="text-navy-300">{step.body}</p>
          </div>
        ))}
      </section>

      {/* Why it matters */}
      <section className="py-16">
        <div className="card text-center max-w-3xl mx-auto">
          <h2 className="font-display text-3xl font-bold mb-4">
            Built for operators, not editors
          </h2>
          <p className="text-navy-200 text-lg mb-2">
            You don't need another video editor. You need <span className="text-gold-400 font-semibold">posts</span>.
          </p>
          <p className="text-navy-300">
            One subscription. All the top clipping engines. We pick the right one for the job, then deliver clips ready to post.
          </p>
        </div>
      </section>
    </div>
  );
}
