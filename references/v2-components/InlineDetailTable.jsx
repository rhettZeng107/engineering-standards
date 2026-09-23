import React from "react";
import EditableRecordTable from "./EditableRecordTable";

/**
 * @param {object} props 透传 EditableProTable 全部 props(columns / value / onChange / editable 等)
 * @param {string} [props.addText="添加行"] 底部添加行按钮文案
 * @param {object|false} [props.recordCreatorProps] 透传/覆盖添加行配置,false 关闭添加行
 * @param {object} [props.editable] 透传 editable 配置(默认 type='multiple')
 * @param {string} [props.className]
 */
const InlineDetailTable = ({
  addText = "添加行",
  className,
  ...rest
}) => {
  const rootClass = className
    ? `v2-inline-detail-table ${className}`
    : "v2-inline-detail-table";
  return <EditableRecordTable addText={addText} className={rootClass} {...rest} />;
};

export default InlineDetailTable;
