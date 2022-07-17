const margin = ({top: 16, right: 6, bottom: 6, left: 0})
const chart_capacity = 12;
var width = 600;
const barHeight = 50, duration=250;
const frames = 2

const x = d3.scaleLinear([0, 1], [margin.left, width - margin.right])
const y = d3.scaleBand()
    .domain(d3.range(chart_capacity + 1))
    .rangeRound([margin.top, margin.top +  barHeight* (chart_capacity+1  + 0.1)])
    .padding(0.1)

const stringToColour = (str) => {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  var colour = '#';
  for (var i = 0; i < 3; i++) {
    var value = (hash >> (i * 8)) & 0xFF;
    colour += ('00' + value.toString(16)).substr(-2);
  }
  return colour;
}

const formatNumber = d3.format(",d")

const fetch_data = async ()=>{
    const data_url = "https://api.russiafossiltracker.com/v0/counter?aggregate_by=date,destination_country";
    resp = await fetch(data_url)
    let data = await resp.json()

    return data.data
}

const rank_data = (value_map, regions, chart_capacity)=> {
    const data = Array.from(regions, region => {
        return {region, value:parseInt(value_map.get(region))}
    });
    data.sort((a, b) => d3.descending(a.value, b.value))
    for (let i = 0; i < data.length; ++i) {
        data[i].rank = Math.min(chart_capacity, i);
    }
    return data;
}

const add_frames = (date_values)=>{
    kfs = []
    for(let i=0; i<date_values.length-1; ++i) {
        current = date_values[i]
        next = date_values[i+1]
        let frame_dv = []
        for(let j=0; j<frames; j++){
            frame_dv[j] = [current[0], new Map()]
        }
        for(var [key,v] of current[1].entries()){
            let start = v || 0
            let end = next[1].get(key) || 0
            for(let k=0; k<frames; k++){
                map_frame = frame_dv[k][1]
                dt = k/frames
                frame_val = start*(1-dt)+end*dt
                map_frame.set(key, frame_val)
            }
        }
        kfs.push(...frame_dv)
    }
    return kfs
}

const sort_by_date = (data)=>{
    const sorted_by_date_data = Array.from(
           d3.rollup(data, ([v]) =>v.value_tonne, d => d.date, d=>d.destination_country)
       ).sort(
           ([a], [b]) => d3.ascending(a, b)
       );

    return sorted_by_date_data
}

const fill_history = (data_history, regions, prev_data, current_data, next_data) => {
    for(let region of regions){
        data_history.set(region, new Map())
    }
    for (let obj of next_data){
        data_history.get(obj.region).set('next', obj)
    }
    for (let obj of prev_data){
        data_history.get(obj.region).set('prev', obj)
    }
    for (let obj of current_data){
        data_history.get(obj.region).set('current', obj)
    }
    data_history.set('next_data', next_data)
    data_history.set('current_data', current_data)
    data_history.set('prev_data', prev_data)
}

const textTween = (a, b) => {
    const i = d3.interpolateNumber(a, b);
    return function(t) {
        this.textContent = formatNumber(i(t));
    };
}

const formatDate = dt => (dt.split('T')[0])

const axis = (graph, chart_capacity) => {
    const g = graph.append("g")
        .attr("transform", `translate(0,${margin.top})`);

    const axis = d3.axisTop(x)
        .ticks(width / 160, undefined)
        .tickSizeOuter(0)
        .tickSizeInner(-barHeight * (chart_capacity + y.padding()));

    return (transition) => {
        g.transition(transition).call(axis);
        g.select(".tick:first-of-type text").remove();
        g.selectAll(".tick:not(:first-of-type) line").attr("stroke", "white");
        g.select(".domain").remove();
    };
}

const ticker = (graph, start, chart_capacity) => {
  const now = graph.append("text")
      .style("font", `bold ${barHeight}px var(--sans-serif)`)
      .style("font-variant-numeric", "tabular-nums")
      .attr("text-anchor", "end")
      .attr("x", width - 6)
      .attr("y", margin.top + barHeight* (chart_capacity - 0.45))
      .attr("dy", "0.32em")
      .text(formatDate(start[0]));

  return (date, transition) => {
    transition.end().then(() => now.text(formatDate(date)));
  };
}


const labels = (graph)=>{
    let label = graph.append("g")
      .style("font", "bold 12px var(--sans-serif)")
      .style("font-variant-numeric", "tabular-nums")
      .attr("text-anchor", "end")
    .selectAll("text");

    return (chart_capacity, data_history, transition) =>label = label
        .data(data_history.get('current_data').slice(0, chart_capacity), d=>d.region)
        .join(
            enter => enter.append("text")
                .attr("transform", d => `translate(${x(data_history.get(d.region).get('prev').value)},${y(data_history.get(d.region).get('prev').rank)})`)
                .attr("y", y.bandwidth() / 2)
                .attr("x", -6)
                .text(d => d.region)
                    .call(text => text.append("tspan")
                        .attr("fill-opacity", 0.7)
                        .attr("font-weight", "normal")
                        .attr("x", -6)
                        .attr("dy", "1.15em")),
                update => update,
                exit => exit.transition(transition).remove()
                    .attr("transform", d => `translate(${x(data_history.get(d.region).get('next').value)},${y(data_history.get(d.region).get('next').rank)})`)
                    .call(g => g.select("tspan").tween("text", d => textTween(d.value, data_history.get(d.region).get('next').value)))
        )
        .call(bar => bar.transition(transition)
            .attr("transform", d => `translate(${x(d.value)},${y(d.rank)})`)
            .call(g => g.select("tspan").tween("text", d => textTween(data_history.get(d.region).get('prev').value, d.value))));

}

const bars = (graph)=>{ 
    let bar = graph.append("g")
        .attr("fill-opacity", 0.8)
        .selectAll("rect");

    return (chart_capacity, data_history, transition) => bar = bar
        .data(data_history.get('current_data').slice(0, chart_capacity), d=>d.region)
        .join (
            enter => enter.append("rect")
                .attr("height", y.bandwidth())
                .attr("fill", d=>stringToColour(d.region))
                .attr("x", x(0))
                .attr("y", d => y(data_history.get(d.region).get('prev').rank))
                .attr("width", d => x(data_history.get(d.region).get('prev').value) - x(0)),
            update => update,
            exit => exit.transition(transition).remove()
                .attr("y", d => y(data_history.get(d.region).get('next').rank))
                .attr("width", d => x(data_history.get(d.region).get('next').value) - x(0))
        )
        .call(bar => bar.transition(transition)
            .attr("y", d => y(d.rank))
            .attr("width", d => x(d.value) - x(0)))
}

const aggregated_data = (data, regions) => {
    regions.forEach(region=>{
        for(let i=0; i< data.length-1; i++) {
            let new_val = (data[i+1][1].get(region) || 0) + (data[i][1].get(region) || 0)
            data[i+1][1].set(region, new_val)
        }
    })
}

const draw = async () => {
    let data = await fetch_data()
    document.getElementById('loading').style.display = 'none';

    width = d3.select('body').node().offsetWidth;

    var graph = d3.select("body")
       .append("svg")
       .attr("width", width)
       .attr("height", barHeight * (chart_capacity+1));



    const update_bar = bars(graph)
    const update_label = labels(graph)
    const update_axis = axis(graph, chart_capacity)

    const regions = new Set(data.map(obj=>obj.destination_country))
    let sorted_by_date_data = sort_by_date(data)

    let data_history = new Map(); 
    regions.forEach(region=>{
        data_history.set(region, new Map())
    })

    aggregated_data(sorted_by_date_data, regions)
    sorted_by_date_data = add_frames(sorted_by_date_data)
    const update_ticker = ticker(graph, sorted_by_date_data[0][0], chart_capacity)

    let data_len = sorted_by_date_data.length

    for(let i=0; i<data_len; i++) {    
        let row = sorted_by_date_data[i];
        let next_row = sorted_by_date_data[Math.min(i+1, data_len-1)];

        next_data = rank_data(next_row[1], regions, chart_capacity)
        current_data = data_history.get('next_data') || rank_data(row[1], regions, chart_capacity)
        prev_data = data_history.get('current_data') || current_data
        fill_history(data_history, regions, prev_data, current_data, next_data)

        x.domain([0, current_data[0].value]);


        let transition = graph.transition()
        .duration(duration)
        .ease(d3.easeLinear);
        
        update_bar(chart_capacity, data_history, transition)
        update_label(chart_capacity, data_history, transition)
        update_ticker(row[0], transition)
        update_axis(transition)
        await transition.end()
    }
}

draw()
