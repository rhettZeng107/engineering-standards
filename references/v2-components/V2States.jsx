// V2 Atlas 三态组件:空 / 错误 / 加载(禁白屏)
// empty/error 用插画 + 文案 + 主操作;loading 用骨架屏;全部吃 v2-tokens 变量
import React from "react";
import { Skeleton } from "antd";
import { InboxOutlined, WarningOutlined } from "@ant-design/icons";
import "./v2-components.css";

/**
 * @param {object} props
 * @param {"empty"|"error"|"loading"} props.type 状态类型
 * @param {React.ReactNode} [props.title]       标题(empty/error)
 * @param {React.ReactNode} [props.description]  描述文案(empty/error)
 * @param {React.ReactNode} [props.action]       主操作区(按钮等,empty/error)
 * @param {number} [props.rows=4]                骨架行数(loading)
 * @param {React.ReactNode} [props.loadingTip]   骨架下方提示文案(loading)
 * @param {string} [props.className]
 * @param {object} [props.style]
 */
const V2States = ({
  type,
  title,
  description,
  action,
  rows = 4,
  loadingTip,
  className,
  style,
}) => {
  if (type === "loading") {
    const rootClass = className
      ? `v2-states v2-states--loading ${className}`
      : "v2-states v2-states--loading";
    return (
      <div className={rootClass} style={style}>
        <Skeleton active paragraph={{ rows }} />
        <div className="v2-states__loading-tip">{loadingTip || "数据加载中…"}</div>
      </div>
    );
  }

  const isError = type === "error";
  const rootClass = [
    "v2-states",
    isError ? "v2-states--error" : "v2-states--empty",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const fallbackTitle = isError ? "数据加载失败" : "暂无数据";

  return (
    <div className={rootClass} style={style}>
      <div className="v2-states__art">
        {isError ? <WarningOutlined /> : <InboxOutlined />}
      </div>
      <div className="v2-states__title">{title || fallbackTitle}</div>
      {description != null && <div className="v2-states__desc">{description}</div>}
      {action != null && <div className="v2-states__acts">{action}</div>}
    </div>
  );
};

export default V2States;
