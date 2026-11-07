import { useId } from 'react'

// Vector redraw of the NeuroGames mark (measured off the 500×500 design
// file, so coordinates are in that space): an "N" of linked nodes under a
// head, with a coral → violet gradient. public/favicon.svg is the same mark.
const FILLETS =
  'M146.64 237.48A16 16 0 0 1 155 251.53L155 212ZM174.36 237.48A16 16 0 0 0 166 251.53L166 212ZM174.36 287.52A16 16 0 0 1 166 273.47L166 313ZM146.64 287.52A16 16 0 0 0 155 273.47L155 313ZM323.14 237.48A16 16 0 0 1 331.5 251.53L331.5 212ZM350.86 237.48A16 16 0 0 0 342.5 251.53L342.5 212ZM350.86 287.52A16 16 0 0 1 342.5 273.47L342.5 313ZM323.14 287.52A16 16 0 0 0 331.5 273.47L331.5 313ZM175.76 236.66A16 16 0 0 1 192.11 236.37L157.77 216.78ZM189.49 212.59A16 16 0 0 0 197.56 226.82L163.23 207.22ZM234.15 238.17A16 16 0 0 1 217.89 238.41L251.73 257.72ZM220.5 262.09A16 16 0 0 0 212.43 247.97L246.27 267.28ZM263.79 286.86A16 16 0 0 1 280.06 286.66L246.26 267.27ZM277.5 262.98A16 16 0 0 0 285.53 277.12L251.74 257.73ZM321.8 288.3A16 16 0 0 1 305.45 288.55L339.74 308.23ZM308.01 312.34A16 16 0 0 0 299.98 298.09L334.26 317.77Z'

export default function Logo({ className }: { className?: string }) {
  // useId() can contain characters that break url(#…) references.
  const gradientId = `ng-logo-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  const paint = `url(#${gradientId})`

  return (
    <svg viewBox="103 106 291 291" className={className} role="img" aria-label="NeuroGames logo">
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="150" y1="325" x2="353.8" y2="206.4">
          <stop offset="0" stopColor="#f77189" />
          <stop offset="1" stopColor="#7941f4" />
        </linearGradient>
      </defs>
      <path
        d="M160.5 212V313M337 212V313M160.5 212L249 262.5L337 313"
        fill="none"
        stroke={paint}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill={paint}>
        {/* Concave fillets where connectors meet nodes (the "liquid" joins) */}
        <path d={FILLETS} />
        <circle cx="249" cy="160.5" r="51.5" />
        <circle cx="160.5" cy="212" r="29" />
        <circle cx="337" cy="212" r="29" />
        <circle cx="249" cy="262.5" r="28.5" />
        <circle cx="160.5" cy="313" r="29" />
        <circle cx="337" cy="313" r="29" />
        <circle cx="249" cy="364.5" r="28.5" />
      </g>
    </svg>
  )
}
