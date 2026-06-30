import type { GardenDrawData } from "@kk-garden/shared/types";
import {
  combineStaticReports,
  generateStaticReport,
} from "@lib/generations/reports/static-report.js";
import {
  animatedReportElementsFromSpriteData,
  combineAnimatedReports,
  generateAnimatedReport,
} from "@lib/generations/reports/animated-report.js";

export const generateGardenDrawDataReport = (data: GardenDrawData) => {
  const staticReports: string = `[${combineStaticReports([
    generateStaticReport(data.tile),
    generateStaticReport(data.stones),
  ])}]`;
  const animatedReports: string = `[${combineAnimatedReports([
    generateAnimatedReport(animatedReportElementsFromSpriteData(data.trees)),
    generateAnimatedReport(animatedReportElementsFromSpriteData(data.bushes)),
  ])}]`;
  return staticReports.concat(animatedReports);
};
