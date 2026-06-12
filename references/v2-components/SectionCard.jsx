// V2 Atlas 分段容器:编号圆徽章段头 + 白卡片
// 用于大型多段表单(主单 + 明细 + 附件 ≥3 段)的每一段
import React from "react";
import "./v2-components.css";

/**
 * @param {object}      props
 * @param {number|string} props.no       段编号(圆徽章内显示)
 * @param {React.ReactNode} props.title  段标题
 * @param {React.ReactNode} [props.desc] 段副标题/描述(标题下方小字)
 * @param {React.ReactNode} [props.extra] 段头右侧内容(状态徽标/操作按钮)
 * @param {string}      [props.id]        锚点 id,供 StepAnchorNav 滚动定位
 * @param {string}      [props.className]
 * @param {object}      [props.style]
 * @param {React.ReactNode} props.children 段正文
 */
const SectionCard = ({ no, title, desc, extra, id, className, style, children }) => {
  const rootClass = className ? `v2-section-card ${className}` : "v2-section-card";

  return (
    <section id={id} className={rootClass} style={style}>
      <div className="v2-section-card__head">
        {no != null && <span className="v2-section-card__badge">{no}</span>}
        <div className="v2-section-card__titlewrap">
          <span className="v2-section-card__title">{title}</span>
          {desc != null && <span className="v2-section-card__desc">{desc}</span>}
        </div>
        <span className="v2-section-card__grow" />
        {extra != null && <span className="v2-section-card__extra">{extra}</span>}
      </div>
      <div className="v2-section-card__body">{children}</div>
    </section>
  );
};

export default SectionCard;
