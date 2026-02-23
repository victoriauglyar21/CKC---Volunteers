import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import "./AppLoader.css";

type AppLoaderProps = {
  visible: boolean;
};

export default function AppLoader({ visible }: AppLoaderProps) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    const previousOverflow = body.style.overflow;

    if (visible) {
      body.style.overflow = "hidden";
    } else {
      body.style.overflow = previousOverflow;
    }

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [visible]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="app-loader-overlay"
          key="app-loader"
          aria-live="polite"
          aria-busy="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.12 : 0.24, ease: "easeOut" }}
        >
          <div className="app-loader-stage" aria-hidden="true">
            <div className="app-loader-track" />
            <motion.div
              className="app-loader-cat-runner"
              animate={
                prefersReducedMotion
                  ? { x: "0vw" }
                  : { x: ["-10vw", "110vw"] }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : {
                      repeat: Infinity,
                      ease: "linear",
                      duration: 4.8,
                    }
              }
            >
              <motion.div
                className="app-loader-cat"
                animate={
                  prefersReducedMotion
                    ? { y: 0 }
                    : { y: [0, -2, 0, -1, 0] }
                }
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { repeat: Infinity, duration: 0.6, ease: "easeInOut" }
                }
              >
                <span className="app-loader-cat-emoji" role="img" aria-label="Walking cat">
                  🐈‍⬛
                </span>
              </motion.div>
            </motion.div>
          </div>

          <motion.p
            className="app-loader-text"
            initial={{ opacity: 0.8 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: [0.82, 1, 0.82] }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { repeat: Infinity, duration: 1.4, ease: "easeInOut" }
            }
          >
            Loading shifts
            <span className="app-loader-dots" aria-hidden="true" />
          </motion.p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
