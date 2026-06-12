// V2 Atlas 行内编辑明细:EditableProTable 薄封装
// 只固化视觉层(整宽虚线「+ 添加行」/ 表头底色 / 边线 token),editable 默认 multiple;其余 props 透传
import React from "react";
import { EditableProTable } from "@ant-design/pro-components";
import { PlusOutlined } from "@ant-design/icons";
import "./v2-components.css";

/**
 * @param {object} props 透传 EditableProTable 全部 props(columns / value / onChange / editable 等)
 * @param {string} [props.addText="添加行"] 底部添加行按钮文案
 * @param {object|false} [props.recordCreatorProps] 透传/覆盖添加行配置,false 关闭添加行
 * @param {object} [props.editable] 透传 editable 配置(默认 type='multiple')
 * @param {string} [props.className]
 */
const InlineDetailTable = ({
  addText = "添加行",
  recordCreatorProps,
  editable,
  className,
  ...rest
}) => {
  const rootClass = className
    ? `v2-inline-detail-table ${className}`
    : "v2-inline-detail-table";

  // 整宽虚线添加行:false 时关闭,否则套 V2 视觉并允许调用方覆盖
  const mergedCreatorProps =
    recordCreatorProps === false
      ? false
      : {
          position: "bottom",
          creatorButtonText: addText,
          icon: <PlusOutlined />,
          style: { width: "100%" },
          ...recordCreatorProps,
          buttonProps: {
            className: "v2-inline-detail-table__add-btn",
            ...(recordCreatorProps && recordCreatorProps.buttonProps),
          },
        };

  const mergedEditable = { type: "multiple", ...editable };

  return (
    <div className={rootClass}>
      <EditableProTable
        size="small"
        recordCreatorProps={mergedCreatorProps}
        editable={mergedEditable}
        {...rest}
      />
    </div>
  );
};

export default InlineDetailTable;
