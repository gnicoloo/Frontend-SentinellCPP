import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as d3 from 'd3'
import { supabase, unwrap } from '../lib/supabaseClient'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { useRange } from '../context/RangeProvider'
import { outcomeColor, shortAddress, type ClusterLeg, type ClusterRow, type PositionRow } from '../lib/types'
import { INK, RAMP, SERIES, rampStep } from '../lib/theme'
import { ago, compact, usd } from '../lib/format'
import FilterBar from '../components/FilterBar'
import LoadError from '../components/LoadError'
import CapNotice from '../components/CapNotice'
import Panel from '../components/viz/Panel'
import StatTile from '../components/viz/StatTile'
import MiniBar from '../components/viz/MiniBar'
import Signed from '../components/viz/Signed'
import ExposureTable, { type ExposureRow } from '../components/viz/ExposureTable'

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  cluster: string
  clusterIndex: number
  /** This member's own capital at risk, from `positions`. */
  notional: number
  /** 0..1 against the busiest member -- drives the ordinal ramp. */
  intensity: number
  isAnchor: boolean
}
interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  cluster: string
}

const HEIGHT = 520
const NODE_CAP = 400
/** Membri disegnati per cluster: oltre, il cluster è reso solo in parte. */
const MEMBERS_PER_CLUSTER = 60
const CLUSTER_CAP = 200
const POSITION_CAP = 5000

export default function ClusterGraph() {
  const svgRef = useRef<SVGSVGElement>(null)
  const navigate = useNavigate()
  const { nonce } = useRange()

  const [selected, setSelected] = useState<string | null>(null)
  const [minWallets, setMinWallets] = useState(2)
  const [hover, setHover] = useState<{ x: number; y: number; node: GraphNode } | null>(null)

  const query = useSupabaseQuery(async () => {
    // The backend owns cluster membership now (GET /clusters -> ClusterTracker).
    // Deriving it here from alert co-occurrence would be a weaker guess that
    // disagrees with the engine's own numbers.
    const [clusters, positions] = await Promise.all([
      unwrap<ClusterRow[]>(
        supabase.from('clusters').select('*')
          .order('total_notional_usd', { ascending: false }).limit(CLUSTER_CAP),
      ),
      unwrap<Pick<PositionRow, 'wallet_address' | 'notional_usd'>[]>(
        supabase.from('positions').select('wallet_address, notional_usd').limit(POSITION_CAP),
      ),
    ])
    return { clusters: clusters ?? [], positions: positions ?? [] }
  }, [nonce])

  const clusters = useMemo(() => query.data?.clusters ?? [], [query.data])
  const positions = useMemo(() => query.data?.positions ?? [], [query.data])
  const loading = query.isLoading

  const notionalByWallet = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of positions) {
      map.set(p.wallet_address, (map.get(p.wallet_address) ?? 0) + p.notional_usd)
    }
    return map
  }, [positions])

  const visible = useMemo(
    () => clusters.filter((c) => c.wallet_count >= minWallets),
    [clusters, minWallets],
  )

  const totals = useMemo(() => ({
    notional: visible.reduce((s, c) => s + c.total_notional_usd, 0),
    unrealized: visible.reduce((s, c) => s + c.unrealized_pnl, 0),
    realized: visible.reduce((s, c) => s + c.realized_pnl, 0),
    wallets: new Set(visible.flatMap((c) => c.wallets ?? [])).size,
    withPositions: visible.reduce((s, c) => s + c.wallets_with_positions, 0),
    markets: visible.reduce((s, c) => s + c.market_count, 0),
  }), [visible])

  const graph = useMemo(() => {
    const nodes: GraphNode[] = []
    const links: GraphLink[] = []
    const maxNotional = Math.max(1, ...[...notionalByWallet.values()])
    // Quanti membri i cluster visibili dichiarano in totale: serve a dire a
    // schermo quanti ne restano fuori quando la potatura scatta.
    const members_total = visible.reduce((s, c) => s + (c.wallets?.length ?? 0), 0)

    visible.forEach((c, clusterIndex) => {
      const members = (c.wallets ?? []).slice(0, MEMBERS_PER_CLUSTER)
      if (members.length === 0) return
      const anchor = c.cluster_key
      for (const id of members) {
        if (nodes.length >= NODE_CAP) break
        const notional = notionalByWallet.get(id) ?? 0
        nodes.push({
          id,
          cluster: c.cluster_key,
          clusterIndex,
          notional,
          intensity: notional / maxNotional,
          isAnchor: id === anchor,
        })
        // Membership is the relation the engine asserts. A star from the
        // cluster key states exactly that, without inventing pairwise edges
        // (and without the O(n^2) mesh a full clique would draw).
        if (id !== anchor) links.push({ source: anchor, target: id, cluster: c.cluster_key })
      }
    })

    const present = new Set(nodes.map((n) => n.id))
    return {
      nodes,
      links: links.filter((l) => present.has(l.source as string) && present.has(l.target as string)),
      membersTotal: members_total,
    }
  }, [visible, notionalByWallet])

  const active = useMemo(
    () => visible.find((c) => c.cluster_key === selected) ?? visible[0] ?? null,
    [visible, selected],
  )

  const legRows = useMemo<ExposureRow[]>(() => {
    const legs: ClusterLeg[] = active?.legs ?? []
    return legs.map((l, i) => ({
      id: `${l.asset_id}-${i}`,
      market: l.market_title || l.asset_id,
      outcome: l.outcome,
      netContracts: l.net_contracts,
      notional: l.notional_usd,
      avgEntry: l.avg_entry_price,
      holders: l.wallets,
      href: l.market_title ? `/alerts?market=${encodeURIComponent(l.market_title)}` : undefined,
    }))
  }, [active])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (graph.nodes.length === 0) return

    const width = svgRef.current?.clientWidth ?? 800
    const container = svg.append('g')
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on('zoom', (event) => container.attr('transform', event.transform)) as never,
    )

    const simulation = d3
      .forceSimulation<GraphNode>(graph.nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(graph.links).id((d) => d.id).distance(46).strength(0.7))
      .force('charge', d3.forceManyBody().strength(-130))
      .force('center', d3.forceCenter(width / 2, HEIGHT / 2))
      .force('collide', d3.forceCollide(18))

    const radius = (d: GraphNode) => (d.isAnchor ? 7 : 5) + Math.sqrt(d.notional) / 14

    const link = container
      .append('g')
      .selectAll('line')
      .data(graph.links)
      .join('line')
      .attr('stroke', INK.axis)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1)

    const node = container
      .append('g')
      .selectAll<SVGCircleElement, GraphNode>('circle')
      .data(graph.nodes)
      .join('circle')
      .attr('r', radius)
      // Magnitude is a single-hue ordinal ramp; membership is carried by
      // position and by the anchor ring, never by a cycled categorical hue.
      .attr('fill', (d) => rampStep(d.intensity))
      .attr('stroke', (d) => (d.cluster === active?.cluster_key ? '#e2e8f0' : INK.surface))
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')

    const hit = container
      .append('g')
      .selectAll<SVGCircleElement, GraphNode>('circle')
      .data(graph.nodes)
      .join('circle')
      .attr('r', (d) => Math.max(12, radius(d) + 6))
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('pointerenter', (event: PointerEvent, d) => {
        const rect = svgRef.current!.getBoundingClientRect()
        setHover({ x: event.clientX - rect.left, y: event.clientY - rect.top, node: d })
      })
      .on('pointerleave', () => setHover(null))
      .on('click', (event: MouseEvent, d) => {
        // Click selects the cluster; shift-click jumps to the wallet.
        if (event.shiftKey) navigate(`/wallet/${d.id}`)
        else setSelected(d.cluster)
      })
      .call(
        d3.drag<SVGCircleElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          }) as never,
      )

    const label = container
      .append('g')
      .selectAll('text')
      .data(graph.nodes.filter((n) => n.isAnchor))
      .join('text')
      .text((d) => shortAddress(d.id))
      .attr('font-size', 9)
      .attr('font-family', 'monospace')
      .attr('fill', INK.secondary)
      .attr('pointer-events', 'none')

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0)
      node.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0)
      hit.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0)
      label.attr('x', (d) => (d.x ?? 0) + radius(d) + 4).attr('y', (d) => (d.y ?? 0) + 3)
    })

    return () => { simulation.stop() }
  }, [graph, navigate, active?.cluster_key])

  const maxClusterNotional = Math.max(1, ...visible.map((c) => c.total_notional_usd))

  return (
    <div>
      <FilterBar title="CLUSTER BOOK" showRange={false}>
        <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
          min members
          <input
            type="range"
            min={2}
            max={10}
            value={minWallets}
            onChange={(e) => setMinWallets(Number(e.target.value))}
            className="w-24 accent-[#22C55E]"
          />
          <span className="num w-3 text-slate-200">{minWallets}</span>
        </label>
        <span className="num font-mono text-[10px] uppercase text-slate-600">
          {compact(visible.length)} clusters · {compact(totals.wallets)} wallets
        </span>
      </FilterBar>

      <div className="space-y-3">
        {query.error && <LoadError message={query.error} onRetry={query.refresh} />}

        <CapNotice
          shown={clusters.length}
          cap={CLUSTER_CAP}
          unit="cluster"
          hint="ordinati per capitale: i cluster più piccoli non sono stati letti"
        />
        <CapNotice
          shown={positions.length}
          cap={POSITION_CAP}
          unit="posizioni"
          hint="la dimensione dei nodi usa solo le posizioni lette"
        />

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <StatTile label="Combined capital at risk" accent={SERIES[0]} value={usd(totals.notional)} footnote={`${visible.length} clusters`} />
          <StatTile label="Unrealized P&L" accent={SERIES[1]} value={usd(totals.unrealized)} footnote={totals.unrealized >= 0 ? '▲ in profit' : '▼ in loss'} />
          <StatTile label="Realized P&L" accent={SERIES[2]} value={usd(totals.realized)} footnote="closed legs" />
          <StatTile label="Wallets clustered" accent={SERIES[3]} value={compact(totals.wallets)} footnote={`${compact(totals.withPositions)} with a book`} />
          <StatTile label="Market legs" accent={SERIES[5]} value={compact(totals.markets)} footnote="across all clusters" />
        </div>

        {!loading && clusters.length === 0 && (
          <p className="border border-sentinel-border bg-sentinel-panel px-3 py-2 font-mono text-[10px] uppercase text-slate-500">
            clusters table empty — run a sync pass with the sentinel metrics endpoint reachable
          </p>
        )}

        <div className="grid gap-3 xl:grid-cols-3">
          <Panel
            title="Clusters by capital"
            meta="click to inspect the book"
            loading={loading}
            table={{
              columns: ['Cluster', 'Wallets', 'Markets', 'Notional', 'Unrealized', 'Realized'],
              rows: visible.map((c) => [
                shortAddress(c.cluster_key), c.wallet_count, c.market_count,
                c.total_notional_usd.toFixed(2), c.unrealized_pnl.toFixed(2), c.realized_pnl.toFixed(2),
              ]),
            }}
          >
            <ul className="max-h-[460px] divide-y divide-sentinel-border/40 overflow-y-auto">
              {visible.length === 0 && (
                <li className="px-3 py-4 font-mono text-[10px] uppercase text-slate-600">no cluster with {minWallets}+ members</li>
              )}
              {visible.map((c) => (
                <li key={c.cluster_key}>
                  <button
                    onClick={() => setSelected(c.cluster_key)}
                    aria-pressed={active?.cluster_key === c.cluster_key}
                    className={`w-full px-3 py-2 text-left transition-colors ${
                      active?.cluster_key === c.cluster_key ? 'bg-sentinel-accent/10' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[11px] text-slate-100">{shortAddress(c.cluster_key)}</span>
                      <span className="font-mono text-[9px] uppercase text-slate-600">
                        {c.wallet_count} wlt · {c.market_count} mkt
                      </span>
                      <span className="num ml-auto text-[11px] font-semibold text-slate-100">{usd(c.total_notional_usd)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <MiniBar value={c.total_notional_usd / maxClusterNotional} color={SERIES[0]} width={72} />
                      <Signed className="num text-[10px]" value={c.unrealized_pnl} format={usd} />
                      <span className="ml-auto font-mono text-[9px] uppercase text-slate-600">
                        {c.wallets_with_positions}/{c.wallet_count} with book
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            className="xl:col-span-2"
            title={active ? `Combined book · ${shortAddress(active.cluster_key)}` : 'Combined book'}
            meta={
              active
                ? `${active.wallet_count} wallets · ${compact(active.gross_contracts)} gross contracts · updated ${ago(new Date(active.updated_at).getTime())} ago`
                : 'select a cluster'
            }
            loading={loading}
            table={{
              columns: ['Market', 'Outcome', 'Holders', 'Net contracts', 'Notional', 'Avg entry'],
              rows: (active?.legs ?? []).map((l) => [
                l.market_title || l.asset_id, l.outcome, l.wallets,
                l.net_contracts.toFixed(2), l.notional_usd.toFixed(2), l.avg_entry_price.toFixed(4),
              ]),
            }}
          >
            <ExposureTable
              rows={legRows}
              showMark={false}
              maxHeight={200}
              emptyLabel={active ? 'cluster holds no open legs' : 'select a cluster'}
            />
            {active && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-sentinel-border px-3 py-2 font-mono text-[10px] uppercase text-slate-500">
                <span>members:</span>
                {(active.wallets ?? []).slice(0, 12).map((w) => (
                  <button
                    key={w}
                    onClick={() => navigate(`/wallet/${w}`)}
                    className="text-sentinel-accent hover:underline"
                  >
                    {shortAddress(w)}
                  </button>
                ))}
                {(active.wallets?.length ?? 0) > 12 && <span className="text-slate-700">+{active.wallets.length - 12} more</span>}
              </div>
            )}
          </Panel>
        </div>

        <Panel
          title="Membership network"
          meta="edge = same cluster · size = wallet capital at risk"
          loading={loading}
          actions={
            <span className="hidden font-mono text-[9px] uppercase text-slate-600 sm:inline">
              click = select cluster · shift+click = open wallet
            </span>
          }
        >
          {/* La potatura del grafo è invisibile per costruzione: un nodo che non
              c'è non lascia traccia. Va detta, altrimenti un cluster reso a
              metà si legge come un cluster piccolo. */}
          <CapNotice
            shown={graph.nodes.length}
            cap={NODE_CAP}
            total={graph.membersTotal}
            unit="nodi"
            hint={`grafo potato a ${NODE_CAP} nodi (max ${MEMBERS_PER_CLUSTER} per cluster) — alza "min membri" per restringere`}
          />

          <div className="relative">
            <svg ref={svgRef} className="w-full" style={{ height: HEIGHT, background: INK.surface }} />

            {graph.nodes.length === 0 && !loading && (
              <p className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase text-slate-600">
                no cluster with {minWallets}+ members
              </p>
            )}

            {hover && (
              <div
                className="pointer-events-none absolute z-10 border border-sentinel-border bg-sentinel-bg px-2 py-1.5 shadow-xl"
                style={{ left: Math.min(hover.x + 12, 620), top: hover.y + 12 }}
              >
                <p className="num text-[11px] font-semibold text-slate-100">{usd(hover.node.notional)}</p>
                <p className="font-mono text-[10px] text-slate-400">{shortAddress(hover.node.id)}</p>
                <p className="font-mono text-[9px] uppercase text-slate-600">
                  {hover.node.isAnchor ? 'cluster anchor' : 'member'} · {shortAddress(hover.node.cluster)}
                </p>
              </div>
            )}

            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 border border-sentinel-border bg-sentinel-panel/90 px-2 py-1">
              <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500">capital</span>
              <span className="font-mono text-[9px] text-slate-600">low</span>
              {RAMP.map((c) => <span key={c} className="inline-block h-2 w-4" style={{ background: c }} />)}
              <span className="font-mono text-[9px] text-slate-600">high</span>
            </div>
          </div>
        </Panel>

        <div className="flex flex-wrap items-center gap-3 pb-2 font-mono text-[9px] uppercase tracking-wider text-slate-700">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2" style={{ background: outcomeColor('Yes') }} /> yes leg
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2" style={{ background: outcomeColor('No') }} /> no leg
          </span>
        </div>
      </div>
    </div>
  )
}
