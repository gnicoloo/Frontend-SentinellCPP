import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as d3 from 'd3'
import { supabase } from '../lib/supabaseClient'
import { shortAddress, type AlertRow } from '../lib/types'

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  cluster: number
  score: number
}
interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  weight: number
}

const CLUSTER_COLORS = ['#38bdf8', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#e879f9', '#94a3b8']

// Costruisce il grafo dai cluster_move / co-occorrenze wallet-mercato degli
// alert sincronizzati: due wallet sono collegati se compaiono su alert dello
// stesso asset. In assenza di dati usa un piccolo grafo dimostrativo.
function buildGraph(alerts: AlertRow[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const byAsset = new Map<string, Set<string>>()
  const scores = new Map<string, number>()
  for (const a of alerts) {
    if (!a.wallet_address || !a.asset_id) continue
    if (!byAsset.has(a.asset_id)) byAsset.set(a.asset_id, new Set())
    byAsset.get(a.asset_id)!.add(a.wallet_address)
    scores.set(a.wallet_address, (scores.get(a.wallet_address) ?? 0) + 1)
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

  const connected = new Set<string>()
  for (const key of linkWeights.keys()) {
    const [a, b] = key.split('|')
    connected.add(a)
    connected.add(b)
  }

  if (connected.size === 0) {
    // Dati insufficienti: grafo demo per mostrare l'interazione.
    const demo = ['0xdemo-a', '0xdemo-b', '0xdemo-c', '0xdemo-d', '0xdemo-e', '0xdemo-f']
    return {
      nodes: demo.map((id, i) => ({ id, cluster: i < 3 ? 0 : 1, score: 2 + (i % 3) })),
      links: [
        { source: '0xdemo-a', target: '0xdemo-b', weight: 2 },
        { source: '0xdemo-b', target: '0xdemo-c', weight: 1 },
        { source: '0xdemo-a', target: '0xdemo-c', weight: 3 },
        { source: '0xdemo-d', target: '0xdemo-e', weight: 2 },
        { source: '0xdemo-e', target: '0xdemo-f', weight: 1 },
      ],
    }
  }

  // Cluster = componenti connesse (union-find minimale).
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    return root
  }
  for (const w of connected) parent.set(w, w)
  for (const key of linkWeights.keys()) {
    const [a, b] = key.split('|')
    parent.set(find(a), find(b))
  }
  const clusterIds = new Map<string, number>()
  const nodes: GraphNode[] = [...connected].slice(0, 300).map((id) => {
    const root = find(id)
    if (!clusterIds.has(root)) clusterIds.set(root, clusterIds.size)
    return { id, cluster: clusterIds.get(root)!, score: scores.get(id) ?? 1 }
  })
  const nodeSet = new Set(nodes.map((n) => n.id))
  const links: GraphLink[] = [...linkWeights.entries()]
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
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    supabase
      .from('alerts')
      .select('wallet_address, asset_id, alert_type')
      .not('wallet_address', 'is', null)
      .limit(2000)
      .then(({ data }) => setAlerts((data as AlertRow[]) ?? []))
  }, [])

  const graph = useMemo(() => buildGraph(alerts), [alerts])

  useEffect(() => {
    setDemo(graph.nodes.length > 0 && graph.nodes[0].id.startsWith('0xdemo'))
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const width = svgRef.current?.clientWidth ?? 800
    const height = 560

    const container = svg.append('g')
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on('zoom', (event) => container.attr('transform', event.transform)) as never,
    )

    const simulation = d3
      .forceSimulation<GraphNode>(graph.nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(graph.links).id((d) => d.id).distance(60))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(18))

    const link = container
      .append('g')
      .selectAll('line')
      .data(graph.links)
      .join('line')
      .attr('stroke', '#334155')
      .attr('stroke-width', (d) => Math.min(4, d.weight))

    const node = container
      .append('g')
      .selectAll<SVGCircleElement, GraphNode>('circle')
      .data(graph.nodes)
      .join('circle')
      .attr('r', (d) => 6 + Math.min(10, d.score))
      .attr('fill', (d) => CLUSTER_COLORS[d.cluster % CLUSTER_COLORS.length])
      .attr('stroke', '#0b1220')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        if (!d.id.startsWith('0xdemo')) navigate(`/wallet/${d.id}`)
      })
      .call(
        d3.drag<SVGCircleElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          }) as never,
      )

    node.append('title').text((d) => `${d.id} — ${d.score} alert`)

    const label = container
      .append('g')
      .selectAll('text')
      .data(graph.nodes)
      .join('text')
      .text((d) => shortAddress(d.id))
      .attr('font-size', 9)
      .attr('fill', '#64748b')
      .attr('pointer-events', 'none')

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0)
      node.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0)
      label.attr('x', (d) => (d.x ?? 0) + 12).attr('y', (d) => (d.y ?? 0) + 3)
    })

    return () => {
      simulation.stop()
    }
  }, [graph, navigate])

  const clusterCount = useMemo(() => new Set(graph.nodes.map((n) => n.cluster)).size, [graph])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">Cluster Graph</h2>
        <span className="text-sm text-slate-500">
          {graph.nodes.length} wallet · {graph.links.length} archi · {clusterCount} cluster
        </span>
        {demo && (
          <span className="rounded bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300">
            dati demo — sincronizza alert con wallet per il grafo reale
          </span>
        )}
      </div>
      <p className="text-sm text-slate-500">
        Zoom con la rotella, trascina i nodi, click su un wallet per aprire la scheda. Archi = co-presenza su alert dello stesso mercato.
      </p>
      <div className="rounded-lg border border-sentinel-border bg-sentinel-panel">
        <svg ref={svgRef} className="h-[560px] w-full" />
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        {CLUSTER_COLORS.slice(0, Math.min(clusterCount, CLUSTER_COLORS.length)).map((c, i) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: c }} /> cluster {i + 1}
          </span>
        ))}
      </div>
    </div>
  )
}
