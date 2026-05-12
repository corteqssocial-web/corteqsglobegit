import { GLOBE_CATEGORIES } from "@/features/globe/constants/categories";

function buildSvgDataUrl(color, label) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="rgba(0,0,0,0.45)"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <path d="M24 4C15.163 4 8 11.163 8 20c0 12 16 24 16 24s16-12 16-24C40 11.163 32.837 4 24 4Z" fill="${color}"/>
        <circle cx="24" cy="20" r="8" fill="#0b1220"/>
        <text x="24" y="24" text-anchor="middle" font-size="8" font-family="Arial, sans-serif" fill="#ffffff">${label}</text>
      </g>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const labelMap = {
  person: "P",
  business: "B",
  ngo: "C",
  creator: "A",
  event: "E",
};

export function getPinIcon(category = "person") {
  const meta = GLOBE_CATEGORIES[category] || GLOBE_CATEGORIES.person;
  return buildSvgDataUrl(meta.color, labelMap[category] || "P");
}
