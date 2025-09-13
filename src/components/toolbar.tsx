import React from "react";

export type GroupByOption = "none" | "folder" | "month";
export type SortByOption = "creation_date_desc" | "creation_date_asc" | "name_asc" | "name_desc";

interface ToolbarProps {
  groupBy: GroupByOption;
  setGroupBy: (option: GroupByOption) => void;
  sortBy: SortByOption;
  setSortBy: (option: SortByOption) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  groupBy,
  setGroupBy,
  sortBy,
  setSortBy,
}) => {
  return (
    <div className="flex items-center gap-6 p-4 bg-gray-100 dark:bg-gray-800 rounded shadow mb-4">
      <div className="flex items-center gap-2">
        <label htmlFor="group-by" className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Group by:
        </label>
        <select
          id="group-by"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupByOption)}
          className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
        >
          <option value="none">None</option>
          <option value="folder">Folder Name</option>
          <option value="month">Month</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="sort-by" className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Sort by:
        </label>
        <select
          id="sort-by"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortByOption)}
          className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
        >
          <option value="creation_date_desc">Creation Date (Newest First)</option>
          <option value="creation_date_asc">Creation Date (Oldest First)</option>
          <option value="name_asc">Name (A-Z)</option>
          <option value="name_desc">Name (Z-A)</option>
        </select>
      </div>
    </div>
  );
};

export default Toolbar;
