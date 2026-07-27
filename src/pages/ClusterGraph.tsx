import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as d3 from 'd3'
import { supabase } from '../lib/supabaseClient'
import { useRange } from '../context/RangeProvider'
import { shortAddress, type AlertRow } from '../lib/types'
import { INK, RAMP, rampStep } from '../lib/theme'
import { compact } from '../lib/format'
import FilterBar from '../components/FilterBar'
import Panel from '../components/viz/Panel'

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  cluster: number
  alerts: number
  /** 0..1 share of the busiest node -- drives the ordinal color ramp. */
  intensity: number
}
interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  weight: number
}

type EdgeRow = Pick<AlertRow, 'wallet_address' | 'asset_id' | 'alert_type' | 'timestamp_ms'>

const HEIGHT = 560
const NODE_CAP = 300

function buildGraph(alerts: EdgeRow[], minWeight: number): { nodes: GraphNode[]; links: GraphLink[] } {
  const byAsset = new Map<string, Set<string>>()
  const counts = new Map<string, number>()
  for (const a of alerts) {
    if (!a.wallet_address || !a.asset_id) continue
    if (!byAsset.has(a.asset_id)) byAsset.set(a.asset_id, new Set())
    byAsset.get(a.asset_id)!.add(a.wallet_address)
    counts.set(a.wallet_address, (counts.get(a.wallet_address) ?? 0) + 1)
  }

  const linkWeights = new Map<string, number>()
  for (const wallets of byAsset.values()) {
    const list = [...wallets]
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && j < i + 16; j++) {
        const key = list[i] < list[j] ? `${list[i]}|${list[j]}` : `${list[j]}|${list[i]}`
        linkWeights.set(key, (linkWeights.get(key) ?? 0) + 1)
      }
    }
  }

  // A co-occurrence floor is the analyst's main lever: one shared market is
  // noise, four is a relationship.
  const edges = [...linkWeights.entries()].filter(([, w]) => w >= minWeight)

  const connected = new Set<string>()
  for (const [key] of edges) {
    const [a, b] = key.split('|')
    connected.add(a)
    connected.add(b)
  }
  if (connected.size === 0) return { nodes: [], links: [] }

  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    return root
  }
  for (const w of connected) parent.set(w, w)
  for (const [key] of edges) {
    const [a, b] = key.split('|')
    parent.set(find(a), find(b))
  }

  const maxAlerts = Math.max(1, ...[...connected].map((id) => counts.get(id) ?? 1))
  const clusterIds = new Map<string, number>()
  const nodes: GraphNode[] = [...connected]
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .slice(0, NODE_CAP)
    .map((id) => {
      const root = find(id)
      if (!clusterIds.has(root)) clusterIds.set(root, clusterIds.size)
      const alerts = counts.get(id) ?? 1
      return { id, cluster: clusterIds.get(root)!, alerts, intensity: alerts / maxAlerts }
    })

  const nodeSet = new Set(nodes.map((n) => n.id))
  const links: GraphLink[] = edges
    .filter(([key]) => {
      const [a, b] = key.split('|')
      return nodeSet.has(a) && nodeSet.has(b)
    })
    .map(([key, weight]) => {
      const [a, b] = key.split('|')
      return { source: a, target: b, weight }
    })

  return { nodes, links }
}

export default function ClusterGraph() {
  const svgRef = useRef<SVGSVGElement>(null)
  const navigate = useNavigate()
  const { def, key: rangeKey, nonce, start, end } = useRange()

  const [alerts, setAlerts] = useState<EdgeRow[]>([])
  const [minWeight, setMinWeight] = useState(1)
  const [loading, setLoading] = useState(true)
  const [hover, setHover] = useState<{ x: number; y: number; node: GraphNode } | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('alerts')
        .select('wallet_address, asset_id, alert_type, timestamp_ms')
        .not('wallet_address', 'is', null)
        .gte('timestamp_ms', start)
        .lte('timestamp_ms', end)
        .limit(6000)
      if (cancelled) return
      setAlerts((data as EdgeRow[]) ?? [])
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [rangeKey, nonce, start, end])

  const graph = useMemo(() => buildGraph(alerts, minWeight), [alerts, minWeight])

  const clusters = useMemo(() => {
    const map = new Map<number, GraphNode[]>()
    for (const n of graph.nodes) {
      if (!map.has(n.cluster)) map.set(n.cluster, [])
      map.get(n.cluster)!.push(n)
    }
    return [...map.entries()]
      .map(([id, members]) => ({
        id,
        size: members.length,
        alerts: members.reduce((s, m) => s + m.alerts, 0),
        members: members.sort((a, b) => b.alerts - a.alerts),
      }))
      .sort((a, b) => b.alerts - a.alerts)
  }, [graph])

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
      .force('link', d3.forceLink<GraphNode, GraphLink>(graph.links).id((d) => d.id).distance(70).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-140))
      .force('center', d3.forceCenter(width / 2, HEIGHT / 2))
      .force('collide', d3.forceCollide(20))

    const radius = (d: GraphNode) => 5 + Math.sqrt(d.alerts) * 2.4

    const link = container
      .append('g')
      .selectAll('line')
      .data(graph.links)
      .join('line')
      .attr('stroke', INK.axis)
      .attr('stroke-opacity', 0.7)
      .attr('stroke-width', (d) => Math.min(3, 0.6 + d.weight * 0.4))

    const node = container
      .append('g')
      .selectAll<SVGCircleElement, GraphNode>('circle')
      .data(graph.nodes)
      .join('circle')
      .attr('r', radius)
      // Magnitude is a single-hue ordinal ramp, never a categorical carousel:
      // cluster membership is carried by position, size by alert count.
      .attr('fill', (d) => rampStep(d.intensity))
      .attr('stroke', INK.surface)
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('pointerenter', (event: PointerEvent, d) => {
        const rect = svgRef.current!.getBoundingClientRect()
        setHover({ x: event.clientX - rect.left, y: event.clientY - rect.top, node: d })
      })
      .on('pointerleave', () => setHover(null))
      .on('click', (_e, d) => navigate(`/wallet/${d.id}`))
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

    // A transparent halo so a 10px node still has a ~24px hit target.
    container
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
      .on('click', (_e, d) => navigate(`/wallet/${d.id}`))
      .attr('class', 'halo')

    // Only the busiest nodes get a direct label -- labelling all 300 is chaos.
    const labelled = new Set(
      [...graph.nodes].sort((a, b) => b.alerts - a.alerts).slice(0, 12).map((n) => n.id),
    )
    const label = container
      .append('g')
      .selectAll('text')
      .data(graph.nodes.filter((n) => labelled.has(n.id)))
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
      container.selectAll<SVGCircleElement, GraphNode>('.halo')
        .attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0)
      label.attr('x', (d) => (d.x ?? 0) + radius(d) + 4).attr('y', (d) => (d.y ?? 0) + 3)
    })

    return () => { simulation.stop() }
  }, [graph, navigate])

  return (
    <div>
      <FilterBar title="CO-TRADING NETWORK">
        <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
          min shared markets
          <input
            type="range"
            min={1}
            max={6}
            value={minWeight}
            onChange={(e) => setMinWeight(Number(e.target.value))}
            className="w-24 accent-[#22C55E]"
          />
          <span className="num w-3 text-slate-200">{minWeight}</span>
        </label>
        <span className="num font-mono text-[10px] uppercase text-slate-600">
          {compact(graph.nodes.length)} nodes · {compact(graph.links.length)} edges · {clusters.length} clusters
        </span>
      </FilterBar>

      <div className="grid gap-3 xl:grid-cols-4">
        <Panel
          className="xl:col-span-3"
          title="Network"
          meta={`${def.label} · edge = shared market · size = alert count`}
          loading={loading}
          actions={
            <span className="hidden items-center gap-1.5 font-mono text-[9px] uppercase text-slate-600 sm:flex">
              scroll zoom · drag node · click to open
            </span>
          }
        >
          <div className="relative">
            <svg ref={svgRef} className="w-full" style={{ height: HEIGHT, background: INK.surface }} />

            {graph.nodes.length === 0 && !loading && (
              <p className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase text-slate-600">
                no co-trading pairs in {def.label} at ≥{minWeight} shared market{minWeight > 1 ? 's' : ''}
              </p>
            )}

            {hover && (
              <div
                className="pointer-events-none absolute z-10 border border-sentinel-border bg-sentinel-bg px-2 py-1.5 shadow-xl"
                style={{ left: Math.min(hover.x + 12, 640), top: hover.y + 12 }}
              >
                <p className="num text-[11px] font-semibold text-slate-100">{hover.node.alerts} alerts</p>
                <p className="font-mono text-[10px] text-slate-400">{shortAddress(hover.node.id)}</p>
                <p className="font-mono text-[9px] uppercase text-slate-600">cluster {hover.node.cluster + 1}</p>
              </div>
            )}

            {/* Scale legend: the ramp encodes magnitude, so it needs a key. */}
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 border border-sentinel-border bg-sentinel-panel/90 px-2 py-1">
              <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500">alerts</span>
              <span className="font-mono text-[9px] text-slate-600">low</span>
              {RAMP.map((c) => <span key={c} className="inline-block h-2 w-4" style={{ background: c }} />)}
              <span className="font-mono text-[9px] text-slate-600">high</span>
            </div>
          </div>
        </Panel>

        <Panel
          title="Clusters"
          meta={`ranked by flow`}
          loading={loading}
          table={{
            columns: ['Cluster', 'Wallets', 'Alerts'],
            rows: clusters.map((c) => [`C${c.id + 1}`, c.size, c.alerts]),
          }}
        >
          <ul className="max-h-[540px] divide-y divide-sentinel-border/40 overflow-y-auto">
            {clusters.length === 0 && <li className="px-3 py-4 font-mono text-[10px] uppercase text-slate-600">no clusters</li>}
            {clusters.map((c) => (
              <li key={c.id} className="px-3 py-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] font-bold text-slate-100">C{c.id + 1}</span>
                  <span className="font-mono text-[9px] uppercase text-slate-600">{c.size} wallets</span>
                  <span className="num ml-auto text-[11px] text-slate-200">{compact(c.alerts)}</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {c.members.slice(0, 3).map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 shrink-0" style={{ background: rampStep(m.intensity) }} />
                      <button
                        onClick={() => navigate(`/wallet/${m.id}`)}
                        className="font-mono text-[10px] text-sentinel-accent hover:underline"
                      >
                        {shortAddress(m.id)}
                      </button>
                      <span className="num ml-auto text-[10px] text-slate-500">{m.alerts}</span>
                    </li>
                  ))}
                  {c.size > 3 && <li className="font-mono text-[9px] text-slate-700">+{c.size - 3} more</li>}
                </ul>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
