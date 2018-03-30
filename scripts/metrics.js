// author: InMon
// version: 1.0
// date: 5/21/2016
// description: Mininet Dashboard Example

include(scriptdir()+'/inc/trend.js');

var points, other='-other-', SEP='_SEP_', trend = new Trend(300,1);

// define flows, prepend application name to avoid name clashes with other apps
setFlow('mn_bytes',{value:'bytes',t:2,fs:SEP});
setFlow('mn_flow',{keys:'ipsource,ipdestination,ipprotocol,or:tcpsourceport:udpsourceport:icmptype,or:tcpdestinationport:udpdestinationport:icmpcode',value:'bytes',t:2,fs:SEP});

function calculateTopN(metric,n,minVal,total_bps) {     
  var total, top, topN, i, bps;
  top = activeFlows('TOPOLOGY',metric,n,minVal,'edge');
  var topN = {};
  if(top) {
    total = 0;
    for(i in top) {
      bps = top[i].value * 8;
      topN[top[i].key] = bps;
      total += bps;
    }
    if(total_bps > total) topN[other] = total_bps - total;
  }
  return topN;
}

function calculateTopInterfaces(metric,n) {
  var top = table('TOPOLOGY','sort:'+metric+':-'+n);
  var topN = {};
  if(top) {
    for(var i = 0; i < top.length; i++) {
      var val = top[i][0];
      var port = topologyInterfaceToPort(val.agent,val.dataSource);
      if(port && port.node && port.port) {
        topN[port.node + SEP + port.port] = val.metricValue * 8; 
      }
    }
  }
  return topN; 
}

function flowCount(flow) {
  var res = activeFlows('TOPOLOGY',flow,1,0,'edge');
  return res && res.length > 0 ? res[0].value : 0;
}

setIntervalHandler(function(now) {
  points = {};
  points['diameter'] = topologyDiameter();

  var bps = flowCount('mn_bytes') * 8;  
  points['top-5-flows'] = calculateTopN('mn_flow',5,1,points.bps);
  points['top-5-interfaces'] = calculateTopInterfaces('mn_bytes',5); 

  trend.addPoints(now,points);
},1);

function getTopologyMetrics() {
  var name,vals,top = getTopology();
  if(top && top.links) {
    for(name in top.links) {
      vals = topologyLinkMetric(name,'mn_bytes');
      top.links[name]['width'] = Math.max(1,Math.log10((vals[0].metricValue || 0) + (vals[1].metricValue || 0)));
    }
  }
  return top;
}

setHttpHandler(function(req) {
  var result, version, key, name, path = req.path;
  if(!path || path.length == 0) throw "not_found";
     
  switch(path[0]) {
    case 'trend':
      if(path.length > 1) throw "not_found"; 
      result = {};
      version = topologyVersion();
      if(version != null) {
        result.topologyMetrics = getTopologyMetrics();
      }
      result.trend = req.query.after ? trend.after(parseInt(req.query.after)) : trend;
      break;
    case 'metric':
      if(path.length == 1) result = points;
      else {
        if(path.length != 2) throw "not_found";
        if(points.hasOwnProperty(path[1])) result = points[path[1]];
        else throw "not_found";
      }
      break;
    default: throw 'not_found';
  } 
  return result;
});
