import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  Bell,
  Box,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  Eye,
  FolderOpen,
  GitBranch,
  Github,
  ListTree,
  LoaderCircle,
  LockKeyhole,
  Network,
  Pause,
  ScanLine,
  ShieldCheck,
  Sparkles,
  X,
} from "./icons";
import type {
  Feature,
  FeatureState,
  Recommendation,
  ScanSnapshot,
} from "../shared/contracts";
const Constellation = lazy(() => import('./Constellation').then(m => ({ default: m.Constellation })));
import { demoSnapshot, initialRecommendations } from "./demo";

const stateLabel: Record<FeatureState, string> = {
  proposed: "Proposed",
  planned: "Planned",
  active: "Active",
  needs_verification: "Needs verification",
  verified: "Verified",
  blocked: "Blocked",
  parked: "Parked",
};
const stateIcon: Record<FeatureState, string> = {
  proposed: "○",
  planned: "◌",
  active: "◉",
  needs_verification: "◇",
  verified: "✓",
  blocked: "!",
  parked: "–",
};
type View = "constellation" | "timeline" | "privacy";

// Native View Transitions API (Chromium renderer). Falls back to an instant
// update when unavailable or when motion is disabled.
type DocumentVT = Document & { startViewTransition?: (cb: () => void) => unknown };
function withTransition(reduced: boolean, update: () => void) {
  const start = (document as DocumentVT).startViewTransition;
  if (reduced || typeof start !== "function") {
    update();
    return;
  }
  start.call(document, update);
}

// Per-item stagger index consumed by CSS animation-delay (var(--i)).
const stagger = (i: number) => ({ ["--i"]: i } as unknown as CSSProperties);

// RAF tween that rolls every numeric token in a label up to its new value
// (handles "1,234", "3/8", "42"). No-ops to the final value under reduced motion.
function useCountUp(value: string, reduced: boolean): string {
  const [display, setDisplay] = useState(value);
  const prevNums = useRef<number[] | null>(null);
  useEffect(() => {
    const literals = value.split(/\d[\d,]*/);
    const targets = (value.match(/\d[\d,]*/g) ?? []).map((s) =>
      Number(s.replace(/,/g, "")),
    );
    if (reduced || targets.length === 0) {
      setDisplay(value);
      prevNums.current = targets;
      return;
    }
    const starts =
      prevNums.current && prevNums.current.length === targets.length
        ? prevNums.current
        : targets.map(() => 0);
    const stitch = (nums: number[]) =>
      literals.reduce(
        (acc, part, i) =>
          acc + part + (i < nums.length ? (nums[i] ?? 0).toLocaleString() : ""),
        "",
      );
    const startedAt = performance.now();
    const duration = 850;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(
        stitch(
          targets.map((t, i) => { const s = starts[i] ?? 0; return Math.round(s + (t - s) * eased) }),
        ),
      );
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
        prevNums.current = targets;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return display;
}

export function App() {
  const [snapshot, setSnapshot] = useState<ScanSnapshot>(demoSnapshot);
  const [selected, setSelected] = useState<Feature | undefined>(
    demoSnapshot.features[1],
  );
  const [recommendations, setRecommendations] = useState(
    initialRecommendations,
  );
  const [view, setView] = useState<View>("constellation");
  const [architecture, setArchitecture] = useState(false);
  const [listMode, setListMode] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = () => setReducedMotion(query.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  async function openProject() {
    if (!window.veyebeDesktop) {
      setNotice(
        "Folder scanning is available in the desktop app. You are exploring the private demo.",
      );
      return;
    }
    const choice = await window.veyebeDesktop.pickFolder();
    if (choice.canceled || !choice.path) return;
    setScanning(true);
    setNotice("Scanning locally — no source leaves this device.");
    try {
      const next = await window.veyebeDesktop.scanFolder(choice.path);
      setSnapshot(next);
      setSelected(next.features[0]);
      setRecommendations(next.recommendations);
      setNotice(
        `Mapped ${next.metrics.files.toLocaleString()} files without uploading source.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not scan this project.",
      );
    } finally {
      setScanning(false);
    }
  }

  function act(id: string, status: Recommendation["status"]) {
    setRecommendations((items) =>
      items.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    setNotice(
      status === "accepted"
        ? "Added to your focus queue."
        : status === "snoozed"
          ? "Snoozed until tomorrow."
          : "Recommendation dismissed.",
    );
  }
  const openRecommendations = useMemo(() => recommendations.filter(
    (item) => item.status === "open",
  ), [recommendations]);
  const verifiedCount = useMemo(() => snapshot.features.filter(
    (feature) => feature.state === "verified",
  ).length, [snapshot.features]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Eye size={17} />
          </div>
          <span>veyebe</span>
          <i>alpha</i>
        </div>
        <nav aria-label="Primary">
          <button
            className={view === "constellation" ? "active" : ""}
            onClick={() => setView("constellation")}
          >
            Project
          </button>
          <button
            className={view === "timeline" ? "active" : ""}
            onClick={() => setView("timeline")}
          >
            Timeline
          </button>
          <button
            className={view === "privacy" ? "active" : ""}
            onClick={() => setView("privacy")}
          >
            Privacy
          </button>
        </nav>
        <div className="top-actions">
          <button className="icon-button" aria-label={`Notifications. ${openRecommendations.length} unread`}>
            <Bell size={17} />
            <b aria-hidden="true">{openRecommendations.length}</b>
          </button>
          <button
            className="open-button"
            onClick={openProject}
            disabled={scanning}
          >
            {scanning ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <FolderOpen size={16} />
            )}{" "}
            Open project
          </button>
          <div className="avatar">VS</div>
        </div>
      </header>

      <main>
        <section className="project-head">
          <div>
            <div className="eyebrow">
              <span className="pulse" /> LOCAL INTELLIGENCE · UPDATED 7M AGO
            </div>
            <h1>{snapshot.projectName}</h1>
            <p>{snapshot.goal}</p>
          </div>
          <div className="metric-row">
            <Metric
              value={snapshot.metrics.files.toLocaleString()}
              label="indexed files"
              icon={<Code2 />}
            />
            <Metric
              value={`${verifiedCount}/${snapshot.features.length}`}
              label="verified features"
              icon={<ShieldCheck />}
            />
            <Metric
              value={snapshot.metrics.commits.toString()}
              label="git events"
              icon={<GitBranch />}
            />
          </div>
        </section>

        {view === "constellation" && (
          <div className="workspace-grid">
            <section className="map-panel">
              <div className="map-toolbar">
                <div>
                  <button
                    className={!listMode ? "selected" : ""}
                    onClick={() => setListMode(false)}
                  >
                    <Network size={15} /> Constellation
                  </button>
                  <button
                    className={listMode ? "selected" : ""}
                    onClick={() => setListMode(true)}
                  >
                    <ListTree size={15} /> Feature list
                  </button>
                </div>
                <div>
                  <button
                    className={architecture ? "selected violet" : ""}
                    onClick={() => setArchitecture(!architecture)}
                  >
                    <Box size={15} /> Architecture lens
                  </button>
                  <button
                    onClick={() => setReducedMotion(!reducedMotion)}
                    title="Toggle motion"
                  >
                    <Pause size={15} />{" "}
                    {reducedMotion ? "Motion off" : "Motion on"}
                  </button>
                </div>
              </div>
              <div className="map-stage">
                {!listMode ? (
                  <Suspense fallback={<div style={{display:'grid',placeItems:'center',height:'100%',color:'#8c93a1'}}>Loading constellation...</div>}>
                    <Constellation
                      features={snapshot.features}
                      selectedId={selected?.id}
                      onSelect={setSelected}
                      architecture={architecture}
                      reducedMotion={reducedMotion}
                    />
                  </Suspense>
                ) : (
                  <FeatureList
                    features={snapshot.features}
                    selected={selected}
                    onSelect={setSelected}
                  />
                )}
                {!listMode && (
                  <>
                    <div className="map-caption">
                      <ScanLine size={14} /> Drag to orbit · Scroll to focus ·
                      Select a feature for evidence
                    </div>
                    <div className="legend">
                      {(
                        [
                          "verified",
                          "active",
                          "needs_verification",
                          "blocked",
                          "planned",
                        ] as FeatureState[]
                      ).map((state) => (
                        <span key={state}>
                          <i className={`state-${state}`} />
                          {stateLabel[state]}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>
            <aside className="insight-rail">
              {selected ? (
                <EvidenceDrawer
                  feature={selected}
                  onClose={() => setSelected(undefined)}
                  onApprove={async (featureId) => {
                    if (!window.veyebeDesktop) {
                      setSnapshot((current) => ({
                        ...current,
                        features: current.features.map((f) =>
                          f.id === featureId
                            ? { ...f, approved: true, state: f.state === "proposed" ? "planned" : f.state }
                            : f,
                        ),
                      }));
                      setNotice("Feature approved in demo mode.");
                      return;
                    }
                    const next = await window.veyebeDesktop.approveFeature(featureId);
                    setSnapshot(next);
                    setSelected(next.features.find((f) => f.id === featureId));
                    setNotice("Feature approved and saved locally.");
                  }}
                />
              ) : (
                <section className="empty-selection">
                  <CircleDot aria-hidden="true" />
                  <h3>Select a feature</h3>
                  <p>
                    Every point in the constellation leads back to inspectable
                    evidence.
                  </p>
                </section>
              )}
              <RecommendationList
                items={openRecommendations}
                onAct={act}
                onNotice={setNotice}
              />
            </aside>
          </div>
        )}
        {view === "timeline" && <Timeline snapshot={snapshot} />}
        {view === "privacy" && (
          <PrivacyPreview
            snapshot={snapshot}
            onSync={async () => {
              if (!window.veyebeDesktop) {
                setNotice("Sync is available in the desktop app after scanning a project.");
                return;
              }
              try {
                const result = await window.veyebeDesktop.syncApprovedPayload();
                setNotice(`Payload synced (${result.snapshotId}).`);
              } catch (error) {
                setNotice(error instanceof Error ? error.message : "Sync failed.");
              }
            }}
          />
        )}
      </main>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
          <button onClick={() => setNotice(undefined)} aria-label="Close">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

const Metric = memo(({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: ReactNode;
}) => (
    <div className="metric">
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
))

const FeatureList = memo(({
  features,
  selected,
  onSelect,
}: {
  features: Feature[];
  selected?: Feature;
  onSelect: (feature: Feature) => void;
}) => (
    <div className="feature-list">
      {features.map((feature) => (
        <button
          key={feature.id}
          className={selected?.id === feature.id ? "selected" : ""}
          onClick={() => onSelect(feature)}
        >
          <span className={`feature-orb state-${feature.state}`} />{" "}
          <div>
            <strong>{feature.title}</strong>
            <small>{feature.summary}</small>
          </div>
          <span className={`state-pill ${feature.state}`}>
            {stateIcon[feature.state]} {stateLabel[feature.state]}
          </span>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
))

const EvidenceDrawer = memo(({
  feature,
  onClose,
  onApprove,
}: {
  feature: Feature;
  onClose: () => void;
  onApprove: (featureId: string) => void | Promise<void>;
}) => {
  return (
    <section className="evidence-card">
      <div className="card-kicker">
        <span className={`state-pill ${feature.state}`}>
          {stateIcon[feature.state]} {stateLabel[feature.state]}
        </span>
        <button className="bare" onClick={onClose} aria-label={`Close evidence for ${feature.title}`}>
          <X size={16} />
        </button>
      </div>
      <h2>{feature.title}</h2>
      <p>{feature.summary}</p>
      {!feature.approved && (
        <button className="open-button" onClick={() => void onApprove(feature.id)}>
          <Check size={14} /> Approve feature
        </button>
      )}
      <div className="confidence">
        <span>Inference confidence</span>
        <strong>{Math.round(feature.confidence * 100)}%</strong>
        <i>
          <b style={{ width: `${feature.confidence * 100}%` }} />
        </i>
      </div>
      <h3>Acceptance signals</h3>
      <ul className="criteria">
        {feature.acceptanceCriteria.map((item) => (
          <li key={item}>
            <CircleDot size={13} />
            {item}
          </li>
        ))}
      </ul>
      <h3>
        Evidence <em>{feature.evidence.length}</em>
      </h3>
      <div className="evidence-list">
        {feature.evidence.map((item) => (
          <button key={item.id}>
            <span className={item.verified ? "verified-dot" : "pending-dot"}>
              {item.verified ? <Check size={11} /> : <Clock3 size={11} />}
            </span>
            <div>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
              {item.location && <code>{item.location}</code>}
            </div>
            <ChevronRight size={14} />
          </button>
        ))}
      </div>
    </section>
  );
})

const RecommendationList = memo(({
  items,
  onAct,
  onNotice,
}: {
  items: Recommendation[];
  onAct: (id: string, status: Recommendation["status"]) => void;
  onNotice: (value: string) => void;
}) => {
  return (
    <section className="recommendations">
      <div className="section-title">
        <div>
          <Sparkles size={15} />
          <h2>Next signals</h2>
        </div>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="all-clear">
          <Check />
          All caught up. The constellation is quiet.
        </div>
      ) : (
        items.map((item) => (
          <article key={item.id} className={`recommendation ${item.severity}`}>
            <div className="rec-head">
              <span>{item.severity}</span>
              <small>{Math.round(item.confidence * 100)}% confidence</small>
            </div>
            <h3>{item.title}</h3>
            <p>{item.rationale}</p>
            <div className="rec-actions">
              <button
                className="accept"
                onClick={() => onAct(item.id, "accepted")}
              >
                <Check size={13} /> Accept
              </button>
              <button onClick={() => onAct(item.id, "snoozed")}>
                <Clock3 size={13} /> Snooze
              </button>
              <button
                onClick={() => {
                  void (async () => {
                    if (!window.veyebeDesktop) {
                      onNotice("GitHub issues require the desktop app.");
                      return;
                    }
                    try {
                      const result = await window.veyebeDesktop.createGitHubIssue({
                        recommendationId: item.id,
                        title: item.title,
                        body: `${item.rationale}\n\nConfidence: ${Math.round(item.confidence * 100)}%`,
                      });
                      if (result.installUrl) {
                        onNotice("Open GitHub App install URL to connect.");
                        window.open(result.installUrl, "_blank");
                        return;
                      }
                      onNotice(result.url ? `Issue created: ${result.url}` : "GitHub issue created.");
                      onAct(item.id, "accepted");
                    } catch (error) {
                      onNotice(error instanceof Error ? error.message : "Could not create GitHub issue.");
                    }
                  })();
                }}
                title="Create GitHub issue"
              >
                <Github size={13} />
              </button>
              <button
                onClick={() => onAct(item.id, "dismissed")}
                aria-label={`Dismiss recommendation: ${item.title}`}
              >
                <X size={13} />
              </button>
            </div>
          </article>
        ))
      )}
    </section>
  );
})

const Timeline = memo(({ snapshot }: { snapshot: ScanSnapshot }) => {
  const events = snapshot.timeline.length
    ? snapshot.timeline
    : [{ id: "scan", date: "Latest scan", title: "Repository analyzed", detail: `${snapshot.metrics.files.toLocaleString()} files mapped locally`, actual: true }];
  return (
    <section className="timeline-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">ACTIVITY, NOT GUESSWORK</span>
          <h2>Project timeline</h2>
          <p>Observed work and planned milestones remain visibly distinct.</p>
        </div>
        <div className="timeline-key">
          <span>
            <i className="actual" />
            Actual
          </span>
          <span>
            <i />
            Planned
          </span>
        </div>
      </div>
      <div className="timeline-track">
        {events.map((event) => (
          <article
            key={event.id}
            className={event.actual ? "actual" : "planned"}
          >
            <time>{event.date}</time>
            <i />
            <div>
              <span>
                {event.actual ? <Activity size={14} /> : <Clock3 size={14} />}
                {event.actual ? "Observed event" : "Planned milestone"}
              </span>
              <h3>{event.title}</h3>
              <p>{event.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
})

const PrivacyPreview = memo(({
  snapshot,
  onSync,
}: {
  snapshot: ScanSnapshot;
  onSync: () => void | Promise<void>;
}) => {
  const payload = snapshot.privacyPreview ?? {
    project: snapshot.projectName,
    feature_states: snapshot.features.map(({ id, state, confidence }) => ({
      id,
      state,
      confidence,
    })),
    aggregate_metrics: snapshot.metrics,
    omitted_categories: ["source code", "absolute paths", "command output"],
  };
  return (
    <section className="privacy-view">
      <div className="privacy-copy">
        <div className="privacy-icon">
          <LockKeyhole />
        </div>
        <span className="eyebrow">OUTBOUND PAYLOAD PREVIEW</span>
        <h2>Your code stays where it belongs.</h2>
        <p>
          Veyebe synchronizes only reviewed, derived project signals. Source
          files, secrets, absolute paths, and raw command output remain on this
          device.
        </p>
        <ul>
          <li>
            <ShieldCheck /> Secret scan before every request
          </li>
          <li>
            <Eye /> Inspect exactly what leaves the device
          </li>
          <li>
            <Pause /> Disable cloud intelligence at any time
          </li>
        </ul>
        <button className="open-button" onClick={() => void onSync()}>Approve this payload</button>
      </div>
      <div className="payload">
        <div>
          <span />
          <span />
          <span />
          <small>sync-preview.json</small>
        </div>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
        <footer>
          <LockKeyhole size={13} /> Redacted locally ·{" "}
          {new Blob([JSON.stringify(payload)]).size} bytes
        </footer>
      </div>
    </section>
  );
})
