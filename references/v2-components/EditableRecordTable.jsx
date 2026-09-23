import React from "react";
import { EditableProTable } from "@ant-design/pro-components";
import { PlusOutlined } from "@ant-design/icons";
import "./v2-components.css";

/**
 * 同构多行记录统一编辑表格。
 *
 * 组件只固化一行一记录、稳定 rowKey、横向滚动和统一新增入口；
 * 字段、校验、权限、删除语义、保存事务与部分成功策略由业务契约提供。
 */
const EditableRecordTable = ({
  addText = "新增记录",
  recordCreatorProps,
  editable,
  className,
  rowKey,
  scroll,
  size = "small",
  ...rest
}) => {
  if (!rowKey) {
    throw new Error("EditableRecordTable requires a stable rowKey.");
  }

  const rootClass = className
    ? `v2-editable-record-table ${className}`
    : "v2-editable-record-table";

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
            className: "v2-editable-record-table__add-btn",
            ...(recordCreatorProps && recordCreatorProps.buttonProps),
          },
        };

  return (
    <div className={rootClass}>
      <EditableProTable
        {...rest}
        rowKey={rowKey}
        size={size}
        scroll={{ x: "max-content", ...scroll }}
        recordCreatorProps={mergedCreatorProps}
        editable={{ type: "multiple", ...editable }}
      />
    </div>
  );
};

export default EditableRecordTable;
