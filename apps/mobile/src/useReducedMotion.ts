import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setEnabled);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setEnabled);
    return () => subscription.remove();
  }, []);
  return enabled;
}
