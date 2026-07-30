import { useEffect, useState } from 'react'

export default function BreakingNewsTicker() {
  const [news, setNews] = useState<{ title: string; source: string; link: string }[]>([])

  useEffect(() => {
    let active = true

    const feeds = [
      'https://news.google.com/rss/search?q=geopolitics+OR+politics&hl=en-US&gl=US&ceid=US:en',
      'https://news.google.com/rss/search?q=crypto+OR+blockchain+OR+web3&hl=en-US&gl=US&ceid=US:en',
      'https://news.google.com/rss/search?q=prediction+markets+OR+polymarket+OR+election+odds&hl=en-US&gl=US&ceid=US:en',
      'https://news.google.com/rss/search?q=federal+reserve+OR+macroeconomics+OR+inflation&hl=en-US&gl=US&ceid=US:en'
    ]

    async function fetchNews() {
      try {
        const fetchPromises = feeds.map(async (feedUrl) => {
          const rssUrl = encodeURIComponent(feedUrl)
          const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`)
          const data = await res.json()
          if (data.status === 'ok' && data.items) {
            return data.items.slice(0, 5) // Prende i primi 5 da ogni feed
          }
          return []
        })

        const results = await Promise.all(fetchPromises)
        const allItems = results.flat()

        if (active && allItems.length > 0) {
          // Mescoliamo le notizie per dare l'effetto "telegiornale" variegato
          const shuffled = allItems.sort(() => 0.5 - Math.random())
          
          const formattedItems = shuffled.slice(0, 15).map((item: any) => {
            const parts = item.title.split(' - ')
            const source = parts.length > 1 ? parts.pop() : 'Google News'
            return {
              title: parts.join(' - '),
              source: source,
              link: item.link
            }
          })
          setNews(formattedItems)
        }
      } catch (err) {
        console.error('Failed to fetch breaking news', err)
      }
    }

    void fetchNews()
    
    const interval = setInterval(fetchNews, 300000) // refresh ogni 5 minuti

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  if (news.length === 0) return null

  return (
    <div className="flex items-center overflow-hidden border-b border-[#f43f5e]/30 bg-[#f43f5e]/10 py-1.5 px-3">
      <div className="shrink-0 flex items-center gap-2 pr-4 z-10 bg-sentinel-panel border-r border-[#f43f5e]/50">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f43f5e] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#f43f5e]"></span>
        </span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#f43f5e]">
          BREAKING INTEL
        </span>
      </div>
      <div className="flex-1 overflow-hidden relative flex">
        <div className="whitespace-nowrap animate-marquee flex items-center">
          {news.map((item, index) => {
            return (
              <span key={index} className="mx-8 font-mono text-[10px] text-slate-200">
                <span className="text-[#14b8a6] mr-2">[{item.source}]</span>
                <a href={item.link} target="_blank" rel="noreferrer" className="uppercase hover:text-white hover:underline">
                  {item.title}
                </a>
                {index < news.length - 1 && <span className="text-[#f43f5e] mx-8">•</span>}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
