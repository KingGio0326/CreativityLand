'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

const NAV_ITEMS = [
  { href: '/',            label: 'DASHBOARD',    icon: '/icons/dashboard.png'   },
  { href: '/agents',      label: 'AGENTS',       icon: '/icons/agents.png'      },
  { href: '/patterns',    label: 'PATTERNS',     icon: '/icons/patterns.png'    },
  { href: '/performance', label: 'PERFORMANCE',  icon: '/icons/performance.png' },
  { href: '/correlation', label: 'CORRELAZIONI', icon: '/icons/correlation.png' },
  { href: '/guide',       label: 'GUIDA',        icon: '/icons/guide.png'       },
  { href: '/articles',    label: 'ARTICLES',     icon: '/icons/articles.png'    },
  { href: '/finbert',     label: 'FINBERT',      icon: '/icons/finbert.png'     },
  { href: '/backtest',    label: 'BACKTEST',     icon: '/icons/backtest.png'    },
  { href: '/search',      label: 'SEARCH',       icon: '/icons/search.png'      },
]

function NavItem({
  item,
  isActive,
  expanded,
}: {
  item: (typeof NAV_ITEMS)[0]
  isActive: boolean
  expanded: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const lit = isActive || hovered

  return (
    <Link
      href={item.href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        // CHIAVE: quando collapsed, centra con justify-content center
        // quando expanded, parti da sinistra
        justifyContent: expanded ? 'flex-start' : 'center',
        width: '100%',
        height: 52,
        // Padding solo quando espansa
        paddingLeft: expanded ? 18 : 0,
        paddingRight: expanded ? 12 : 0,
        gap: expanded ? 12 : 0,
        textDecoration: 'none',
        position: 'relative',
        boxSizing: 'border-box',
        background: isActive
          ? 'rgba(124,58,237,0.15)'
          : hovered
          ? 'rgba(124,58,237,0.07)'
          : 'transparent',
        transition: 'background 0.15s ease',
      }}
    >
      {/* Indicatore attivo — bordo sinistro */}
      {isActive && (
        <div style={{
          position: 'absolute',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 3,
          height: 28,
          background: 'linear-gradient(180deg, #7c3aed, #a855f7)',
          borderRadius: '0 4px 4px 0',
          boxShadow: '0 0 8px rgba(168,85,247,0.8)',
        }} />
      )}

      {/* Box icona */}
      <div style={{
        width: 36,
        height: 36,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        background: lit ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.05)',
        boxShadow: lit ? '0 0 16px rgba(168,85,247,0.5)' : 'none',
        transition: 'all 0.2s ease',
      }}>
        <Image
          src={item.icon}
          alt={item.label}
          width={24}
          height={24}
          style={{
            opacity: lit ? 1 : 0.4,
            filter: lit
              ? 'drop-shadow(0 0 5px rgba(168,85,247,1)) brightness(1.4) saturate(1.3)'
              : 'grayscale(0.4) brightness(0.8)',
            transform: lit ? 'scale(1.1)' : 'scale(1)',
            transition: 'all 0.2s ease',
          }}
        />
      </div>

      {/* Label — visibile solo quando expanded */}
      <span style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: isActive ? '#a855f7' : hovered ? '#c084fc' : '#4a4a6a',
        whiteSpace: 'nowrap',
        // Nascondi quando collapsed: opacity 0 + larghezza 0
        maxWidth: expanded ? 200 : 0,
        opacity: expanded ? 1 : 0,
        overflow: 'hidden',
        transition: 'opacity 0.2s ease, max-width 0.25s ease, color 0.15s ease',
        pointerEvents: 'none',
      }}>
        {item.label}
      </span>
    </Link>
  )
}

export default function FloatingSidebar() {
  const [expanded, setExpanded] = useState(false)
  const pathname = usePathname()

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&display=swap"
        rel="stylesheet"
      />

      <div
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        style={{
          position: 'fixed',
          left: 16,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 100,

          // Larghezza transizione
          width: expanded ? 210 : 64,
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',

          // Stile pillola
          background: 'rgba(14,14,26,0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(139,92,246,0.2)',
          borderRadius: 24,
          boxShadow: [
            '0 8px 40px rgba(0,0,0,0.7)',
            '0 0 0 1px rgba(139,92,246,0.08)',
            'inset 0 1px 0 rgba(255,255,255,0.05)',
          ].join(', '),

          // Layout interno
          display: 'flex',
          flexDirection: 'column',
          // NON mettere alignItems qui — lo gestisce ogni NavItem
          paddingTop: 8,
          paddingBottom: 8,
          overflow: 'hidden',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <NavItem
              key={item.href}
              item={item}
              isActive={isActive}
              expanded={expanded}
            />
          )
        })}

        {/* Dot live */}
        <div style={{
          marginTop: 4,
          paddingTop: 10,
          borderTop: '1px solid rgba(139,92,246,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: expanded ? 'flex-start' : 'center',
          paddingLeft: expanded ? 22 : 0,
          gap: 10,
          height: 36,
          flexShrink: 0,
        }}>
          <div style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 8px #10b981',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#10b981',
            whiteSpace: 'nowrap',
            maxWidth: expanded ? 200 : 0,
            opacity: expanded ? 1 : 0,
            overflow: 'hidden',
            transition: 'opacity 0.2s ease, max-width 0.25s ease',
          }}>
            BOT LIVE
          </span>
        </div>
      </div>
    </>
  )
}
