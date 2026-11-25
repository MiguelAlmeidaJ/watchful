import { useEffect, useRef, useState } from 'react';

export function useNearViewport(rootMargin = '128px 0px', enabled = true) {
 const ref = useRef<HTMLDivElement>(null);
 const [near, setNear] = useState(false);

 useEffect(() => {
  const node = ref.current;
  if (!node || !enabled || near) return;
  if (typeof IntersectionObserver === 'undefined') {
   setNear(true);
   return;
  }
  const observer = new IntersectionObserver(([entry]) => {
   if (!entry?.isIntersecting) return;
   setNear(true);
   observer.disconnect();
  }, { rootMargin });
  observer.observe(node);
  return () => observer.disconnect();
 }, [rootMargin, enabled, near]);

 return { ref, near };
}
