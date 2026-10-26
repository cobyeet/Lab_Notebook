export const pythonFigures = `"""Create publication-sized figures from CSV source tables; originals stay intact."""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

root = Path(__file__).resolve().parent
notebook = json.loads((root / "notebook.json").read_text(encoding="utf-8"))
settings = json.loads((root / "export-settings.json").read_text(encoding="utf-8"))
font_manager.fontManager.addfont(str(root / "fonts" / "LiberationSans-Regular.ttf"))
font = "Liberation Sans"
for candidate in ("Arial", "Helvetica"):
    try:
        font_manager.findfont(candidate, fallback_to_default=False)
        font = candidate
        break
    except ValueError:
        pass

dark = settings["theme"] == "dark"
bg, fg = ("#17191c", "#eee5d6") if dark else ("#ffffff", "#202124")
colors = ["#e9b568", "#8bc6d8", "#d999bb", "#a9c997"] if dark else ["#0072B2", "#D55E00", "#009E73", "#CC79A7"]
plt.rcParams.update({
    "font.family": font, "font.size": 6, "axes.labelsize": 7,
    "axes.titlesize": 7, "xtick.labelsize": 6, "ytick.labelsize": 6,
    "legend.fontsize": 6, "axes.linewidth": 0.6, "lines.linewidth": 0.8,
    "xtick.major.width": 0.6, "ytick.major.width": 0.6,
    "xtick.major.size": 2.5, "ytick.major.size": 2.5,
    "figure.facecolor": bg, "axes.facecolor": bg, "savefig.facecolor": bg,
    "text.color": fg, "axes.labelcolor": fg, "axes.edgecolor": fg,
    "xtick.color": fg, "ytick.color": fg,
    "pdf.fonttype": 42, "ps.fonttype": 42, "svg.fonttype": "none",
})
out = root / ("python_exports_" + settings["theme"])
out.mkdir(exist_ok=True)
records = []
for entry in notebook["entries"]:
    for index, attachment in enumerate(entry["attachments"]):
        if attachment["kind"] != "table":
            continue
        table = attachment["table"]
        numeric = []
        for column, name in enumerate(table["headers"]):
            try:
                values = [float(row[column]) if row[column].strip() else float("nan") for row in table["rows"]]
                if any(row[column].strip() for row in table["rows"]):
                    numeric.append((name, values))
            except ValueError:
                pass
        if not numeric:
            continue
        values = np.array([column[1] for column in numeric]).T
        stem = out / (entry["id"] + "_" + str(index))
        np.savez_compressed(str(stem) + ".npz", values=values, columns=np.array([c[0] for c in numeric]))
        width, height = settings["figureWidthMm"], settings["figureHeightMm"]
        fig, ax = plt.subplots(figsize=(width / 25.4, height / 25.4), layout="constrained")
        if len(numeric) > 1:
            for k, (name, column) in enumerate(numeric[1:]):
                ax.plot(numeric[0][1], column, label=name, color=colors[k % len(colors)], linestyle=["-", "--", "-.", ":"][k % 4])
            ax.set_xlabel(numeric[0][0])
            ax.set_ylabel("Value")
        else:
            ax.plot(numeric[0][1], label=numeric[0][0], color=colors[0])
            ax.set_xlabel("Row")
            ax.set_ylabel(numeric[0][0])
        ax.spines[["top", "right"]].set_visible(False)
        ax.legend(frameon=False, labelcolor=fg)
        ax.set_title(attachment["name"], loc="left", pad=5)
        # Do not use bbox_inches='tight': it changes the selected physical size.
        for ext in ("svg", "pdf", "png"):
            fig.savefig(str(stem) + "." + ext, dpi=settings["rasterDpi"], transparent=False)
        records.append({"entry": entry["id"], "attachment": attachment["name"], "font": font,
                        "widthMm": width, "heightMm": height, "theme": settings["theme"],
                        "fontSizesPt": {"label": 7, "tick": 6, "legend": 6}, "rasterDpi": settings["rasterDpi"]})
        plt.close(fig)
(out / "figure-manifest.json").write_text(json.dumps(records, indent=2), encoding="utf-8")
print("Exports saved to", out)
`;

export const matlabFigures = `% Generate figures from numeric CSVs; original attachments are preserved.
% Run this file in MATLAB when you choose. The website never starts MATLAB.
root = fileparts(mfilename('fullpath'));
notebook = jsondecode(fileread(fullfile(root,'notebook.json')));
settings = jsondecode(fileread(fullfile(root,'export-settings.json')));
out = fullfile(root,['matlab_exports_' settings.theme]); if ~isfolder(out), mkdir(out); end
fonts = listfonts; font = 'Helvetica';
if any(strcmpi(fonts,'Arial')), font = 'Arial';
elseif any(strcmpi(fonts,'Helvetica')), font = 'Helvetica';
elseif any(strcmpi(fonts,'Liberation Sans')), font = 'Liberation Sans';
else, font = 'DejaVu Sans'; warning('Notebook:FontFallback','Arial/Helvetica unavailable; using DejaVu Sans. Review font substitution.'); end
if strcmp(settings.theme,'dark')
    bg = [23 25 28]/255; fg = [238 229 214]/255;
    colors = [233 181 104;139 198 216;217 153 187;169 201 151]/255;
else
    bg = [1 1 1]; fg = [32 33 36]/255;
    colors = [0 114 178;213 94 0;0 158 115;204 121 167]/255;
end
entries = notebook.entries; if isstruct(entries), entries = num2cell(entries); end
records = struct('entry',{},'attachment',{},'font',{},'widthMm',{},'heightMm',{},'theme',{});
for i = 1:numel(entries)
    e = entries{i}; attachments = e.attachments;
    if isstruct(attachments), attachments = num2cell(attachments); end
    for j = 1:numel(attachments)
        a = attachments{j}; if ~strcmp(a.kind,'table'), continue; end
        raw = matlab.net.base64decode(extractAfter(string(a.data),','));
        source = fullfile(out,sprintf('source_%s_%d.csv',e.id,j));
        fid = fopen(source,'w'); if fid<0, error('Cannot create CSV source'); end
        fwrite(fid,raw,'uint8'); fclose(fid);
        t = readtable(source,'VariableNamingRule','preserve');
        numeric = varfun(@isnumeric,t,'OutputFormat','uniform');
        t = t(:,numeric); if width(t)==0, continue; end
        w = settings.figureWidthMm/10; ht = settings.figureHeightMm/10;
        f = figure('Visible','off','Color',bg,'InvertHardcopy','off',...
            'Units','centimeters','Position',[2 2 w ht],...
            'PaperUnits','centimeters','PaperSize',[w ht],...
            'PaperPosition',[0 0 w ht],'PaperPositionMode','manual');
        ax = axes(f,'Units','normalized','Position',[.16 .19 .79 .67],...
            'Color',bg,'XColor',fg,'YColor',fg,'FontName',font,'FontSize',6,...
            'LineWidth',.6,'Box','off','TickDir','out','ColorOrder',colors,...
            'LineStyleOrder',{'-','--','-.',':'},'NextPlot','add');
        if width(t)>1
            for k=2:width(t)
                plot(ax,t{:,1},t{:,k},'DisplayName',t.Properties.VariableNames{k},'LineWidth',.8);
            end
            xlabel(ax,t.Properties.VariableNames{1},'Interpreter','none','FontName',font,'FontSize',7,'Color',fg);
            ylabel(ax,'Value','FontName',font,'FontSize',7,'Color',fg);
        else
            plot(ax,t{:,1},'DisplayName',t.Properties.VariableNames{1},'LineWidth',.8);
            xlabel(ax,'Row','FontName',font,'FontSize',7,'Color',fg);
            ylabel(ax,t.Properties.VariableNames{1},'Interpreter','none','FontName',font,'FontSize',7,'Color',fg);
        end
        title(ax,a.name,'Interpreter','none','FontName',font,'FontSize',7,'FontWeight','normal','Color',fg);
        legend(ax,'Interpreter','none','FontName',font,'FontSize',6,'TextColor',fg,'Box','off','Color',bg);
        f.UserData = struct('exportSettings',settings,'sourceEntry',e.id,'sourceAttachment',a.name,'font',font);
        stem = fullfile(out,sprintf('%s_%d',e.id,j));
        savefig(f,[stem '.fig']);
        print(f,[stem '.pdf'],'-dpdf','-painters');
        print(f,[stem '.png'],'-dpng','-r300');
        close(f);
        records(end+1) = struct('entry',e.id,'attachment',a.name,'font',font,...
            'widthMm',settings.figureWidthMm,'heightMm',settings.figureHeightMm,'theme',settings.theme);
    end
end
fid = fopen(fullfile(out,'figure-manifest.json'),'w');
fwrite(fid,jsonencode(records),'char'); fclose(fid);
`;
