// V2 Atlas 顶部编号步骤锚点条:点击平滑滚动到对应 SectionCard,滚动时联动高亮当前段
// 可跳读非强制向导(无禁用态);sticky 定位兼容 Wujie 容器(position:sticky + 可配 offsetTop)
import React, { useEffect, useRef, useState } from "react";
import "./v2-components.css";

/**
 * @param {object} props
 * @param {Array<{key:string,title:React.ReactNode,targetId:string}>} props.items 步骤项(建议 useMemo 稳定引用,每 render 新数组会重绑滚动监听)
 * @param {number} [props.offsetTop=0] sticky 顶部偏移 + 滚动定位补偿(避开固定头部)
 * @param {string} [props.className]
 * @param {object} [props.style]
 */
const StepAnchorNav = ({ items = [], offsetTop = 0, className, style }) => {
  const [activeKey, setActiveKey] = useState(items[0] ? items[0].key : null);
  const tickingRef = useRef(false);

  // 滚动联动高亮:取视口内最靠近 offsetTop 上沿的段为当前段
  useEffect(() => {
    if (!items.length) return undefined;

    const computeActive = () => {
      tickingRef.current = false;
      let currentKey = items[0].key;
      for (let i = 0; i < items.length; i += 1) {
        const el = document.getElementById(items[i].targetId);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - offsetTop - 12 <= 0) {
          currentKey = items[i].key;
        }
      }
      setActiveKey(currentKey);
    };

    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      window.requestAnimationFrame(computeActive);
    };

    computeActive();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items, offsetTop]);

  const handleClick = (item) => {
    setActiveKey(item.key);
    const el = document.getElementById(item.targetId);
    if (!el) return;
    const targetTop = el.getBoundingClientRect().top + window.pageYOffset - offsetTop - 12;
    window.scrollTo({ top: Math.max(targetTop, 0), behavior: "smooth" });
  };

  const rootClass = className ? `v2-step-anchor-nav ${className}` : "v2-step-anchor-nav";

  return (
    <nav className={rootClass} style={{ top: offsetTop, ...style }}>
      {items.map((item, idx) => (
        <React.Fragment key={item.key}>
          {idx > 0 && <span className="v2-step-anchor-nav__line" />}
          <button
            type="button"
            className={
              activeKey === item.key
                ? "v2-step-anchor-nav__item is-active"
                : "v2-step-anchor-nav__item"
            }
            onClick={() => handleClick(item)}
          >
            <span className="v2-step-anchor-nav__dot">{idx + 1}</span>
            <span className="v2-step-anchor-nav__title">{item.title}</span>
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
};

export default StepAnchorNav;
