import { motion } from "framer-motion";

const pawPrints = [
  { top: "10%", left: "14%", rotate: -14 },
  { top: "16%", left: "29%", rotate: 11 },
  { top: "11%", left: "47%", rotate: -7 },
  { top: "20%", left: "64%", rotate: 16 },
  { top: "14%", left: "82%", rotate: -10 },
  { top: "30%", left: "10%", rotate: 8 },
  { top: "36%", left: "24%", rotate: -16 },
  { top: "28%", left: "40%", rotate: 13 },
  { top: "38%", left: "57%", rotate: -9 },
  { top: "31%", left: "74%", rotate: 12 },
  { top: "43%", left: "88%", rotate: -15 },
  { top: "54%", left: "15%", rotate: 10 },
  { top: "62%", left: "30%", rotate: -11 },
  { top: "56%", left: "47%", rotate: 14 },
  { top: "67%", left: "62%", rotate: -8 },
  { top: "59%", left: "79%", rotate: 9 },
  { top: "74%", left: "22%", rotate: -17 },
  { top: "81%", left: "38%", rotate: 12 },
  { top: "77%", left: "55%", rotate: -10 },
  { top: "85%", left: "71%", rotate: 15 },
];

function PawIcon() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-12 w-12 text-[#cc9f8c]"
      fill="currentColor"
      aria-hidden="true"
    >
      <ellipse cx="20" cy="17" rx="6" ry="8" transform="rotate(-20 20 17)" />
      <ellipse cx="32" cy="13" rx="6" ry="8" />
      <ellipse cx="44" cy="17" rx="6" ry="8" transform="rotate(20 44 17)" />
      <ellipse cx="16" cy="29" rx="5" ry="7" transform="rotate(-30 16 29)" />
      <path d="M32 25c-10 0-18 7-18 16 0 7 6 13 18 13s18-6 18-13c0-9-8-16-18-16z" />
    </svg>
  );
}

export default function SplashScreen() {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#fcf0eb]"
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{ duration: 0.9, times: [0, 0.72, 1], ease: "easeInOut" }}
    >
      <div className="relative h-full w-full overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#fae7df_0%,_#fcf0eb_55%,_#f8e1d4_100%)]"
          initial={{ x: 0, y: 0 }}
          animate={{ opacity: [0.96, 1, 0.98] }}
          transition={{ duration: 0.75, ease: "easeInOut" }}
        >
          {pawPrints.map((paw, index) => (
            <motion.div
              key={index}
              className="absolute"
              style={{ left: paw.left, top: paw.top }}
              initial={{ opacity: 0, scale: 0.85, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.18, delay: index * 0.02, ease: "easeOut" }}
            >
              <div
                style={{
                  transform: `translateX(${index % 2 === 0 ? "-2px" : "2px"}) rotate(${paw.rotate}deg)`,
                }}
              >
                <PawIcon />
              </div>
            </motion.div>
          ))}
        </motion.div>

        <div className="absolute inset-0 flex flex-col items-center justify-start px-6 pt-14 text-center sm:pt-16">
          <motion.div
            className="mt-4 rounded-3xl bg-[#fcf0eb]/95 px-6 py-5 shadow-xl ring-1 ring-[#cc9f8c]"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.18, ease: "easeOut" }}
          >
            <motion.img
              src="/pwa-512.png"
              alt="CKC logo"
              className="mx-auto h-24 w-24 drop-shadow-sm sm:h-28 sm:w-28"
              initial={{ opacity: 0, scale: 0.85, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.24, type: "spring", stiffness: 170, damping: 18 }}
            />

            <motion.div
              className="mt-4 text-[#2f2018]"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.22, ease: "easeOut" }}
            >
              <p className="text-6xl font-black tracking-tight [text-shadow:0_1px_8px_rgba(229,193,176,0.65)] sm:text-7xl">
                Colorado Kitty Coalition
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
