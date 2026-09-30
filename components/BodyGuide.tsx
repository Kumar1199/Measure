export function BodyGuide({
  side = false,
  compact = false,
}: {
  side?: boolean;
  compact?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 360 540"
      fill="none"
      className={`body-guide ${compact ? "compact" : ""}`}
      aria-label={side ? "Side profile pose guide" : "Front A-pose guide"}
      role="img"
    >
      <defs>
        <linearGradient
          id={side ? "body-side" : "body-front"}
          x1="180"
          y1="40"
          x2="180"
          y2="510"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#bdd5c6" stopOpacity=".15" />
          <stop offset="1" stopColor="#bdd5c6" stopOpacity=".03" />
        </linearGradient>
      </defs>
      {side ? (
        <path
          d="M174 41 C151 41 151 76 159 91 L157 111 C141 123 137 153 143 193 L146 259 C136 291 148 328 153 353 L152 455 L146 487 Q141 505 158 506 L190 506 Q200 501 188 490 L173 479 L180 366 L190 292 Q201 274 194 239 L189 167 L197 132 L187 112 L186 94 L200 81 L192 71 Q194 41 174 41Z"
          fill="url(#body-side)"
          stroke="#9bb9a9"
          strokeOpacity=".5"
        />
      ) : (
        <path
          d="M180 38 C153 38 153 75 161 87 L166 105 L146 113 Q128 115 117 140 L80 210 L54 260 Q48 271 58 278 Q67 282 74 270 L105 223 L139 173 L143 227 Q133 267 140 297 L136 359 L120 471 L112 491 Q105 506 122 508 L145 505 L151 482 L169 370 L180 316 L191 370 L209 482 L215 505 L238 508 Q255 506 248 491 L240 471 L224 359 L220 297 Q227 267 217 227 L221 173 L255 223 L286 270 Q293 282 302 278 Q312 271 306 260 L280 210 L243 140 Q232 115 214 113 L194 105 L199 87 C207 75 207 38 180 38Z"
          fill="url(#body-front)"
          stroke="#9bb9a9"
          strokeOpacity=".45"
          strokeWidth="1.5"
        />
      )}
      {!side && (
        <g stroke="#adc6b6" strokeOpacity=".3" strokeDasharray="3 5">
          <path d="M180 104V310M146 133L100 216L64 268M214 133L260 216L296 268M146 133H214M153 277H207M153 277L154 366L133 480M207 277L206 366L227 480" />
          {[
            [146, 133],
            [214, 133],
            [100, 216],
            [260, 216],
            [64, 268],
            [296, 268],
            [153, 277],
            [207, 277],
            [154, 366],
            [206, 366],
            [133, 480],
            [227, 480],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3" fill="#93b69f" stroke="none" />
          ))}
        </g>
      )}
      {!compact && (
        <g fontFamily="monospace" fontSize="9" letterSpacing="1">
          <path d="M130 167H238" stroke="#b1d0b5" strokeDasharray="3 3" />
          <text x="248" y="170" fill="#b1d0b5">
            CHEST
          </text>
          <path d="M137 232H238" stroke="#d4b387" strokeDasharray="3 3" />
          <text x="248" y="235" fill="#d4b387">
            WAIST
          </text>
          <path d="M130 281H238" stroke="#ac9fc7" strokeDasharray="3 3" />
          <text x="248" y="284" fill="#ac9fc7">
            HIPS
          </text>
          <path d="M180 316V482" stroke="#92bfc6" strokeDasharray="3 3" />
        </g>
      )}
    </svg>
  );
}
