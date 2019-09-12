$(function() { 
  var restPath =  '../scripts/metrics.js/';
  var dataURL = restPath + 'trend/json';
  var SEP = '_SEP_';
  var nodes, edges, network, version = null;

  var defaults = {
    tab:0,
    overall0:'show',
    overall1:'show',
  };

  var state = {};
  $.extend(state,defaults);

  function createQuery(params) {
    var query, key, value;
    for(key in params) {
      value = params[key];
      if(value == defaults[key]) continue;
      if(query) query += '&';
      else query = '';
      query += encodeURIComponent(key)+'='+encodeURIComponent(value);
    }
    return query;
  }

  function getState(key, defVal) {
    return window.sessionStorage.getItem('mn_'+key) || state[key] || defVal;
  }

  function setState(key, val, showQuery) {
    state[key] = val;
    window.sessionStorage.setItem('mn_'+key, val);
    if(showQuery) {
      var query = createQuery(state);
      window.history.replaceState({},'',query ? '?' + query : './');
    }
  }

  function setQueryParams(query) {
    var vars, params, i, pair;
    vars = query.split('&');
    params = {};
    for(i = 0; i < vars.length; i++) {
      pair = vars[i].split('=');
      if(pair.length == 2) setState(decodeURIComponent(pair[0]), decodeURIComponent(pair[1]),false);
    }
  }

  var search = window.location.search;
  if(search) setQueryParams(search.substring(1));

  $('#clone_button').button({icons:{primary:'ui-icon-newwin'},text:false}).click(function() {
    window.open(window.location);
  });

  $('#overall-acc > div').each(function(idx) {
    $(this).accordion({
      heightStyle:'content',
      collapsible: true,
      active: getState('overall'+idx, 'hide') == 'show' ? 0 : false,
      activate: function(event, ui) {
        var newIndex = $(this).accordion('option','active');
        setState('overall'+idx, newIndex === 0 ? 'show' : 'hide', true);
        $.event.trigger({type:'updateChart'});
      }
    });
  });

  $('#tabs').tabs({
    active: getState('tab', 0),
    activate: function(event, ui) {
      var newIndex = ui.newTab.index();
      setState('tab', newIndex, true);
      $.event.trigger({type:'updateChart'});
      network.fit();
    },
    create: function(event,ui) {
      $.event.trigger({type:'updateChart'});
    }
  }); 

  var db = {};
  $('#diameter').chart({
    type: 'trend',
    metrics: ['diameter'],
    stack:false,
    units: 'Topology Diameter'},
  db);
  $('#topflows').chart({
    type: 'topn',
    stack: true,
    sep: SEP,
    metric: 'top-5-flows',
    legendHeadings: ['Src Addr','Dst Addr','Proto','Src Prt','Dst Prt'],
    units: 'Bits per Second'},
  db);
  $('#links').chart({
    type: 'topn',
    stack: false,
    sep: SEP,
    metric: 'top-5-interfaces',
    legendHeadings: ['Switch','Port'],
    units: 'Bits per Second'},
  db); 

  function updateTopology(top) {
    var node, edge, entry, ids, i;
    if(top.nodes) {
      for(node in top.nodes) {
        if(!nodes.get(node)) nodes.add({id:node,label:node}); 
      }
    }
    if(top.links) {
      for(edge in top.links) {
        entry = top.links[edge]; 
        if(!edges.get(edge)) edges.add({id:edge,from:entry.node1,to:entry.node2});
      }
    }
    ids = nodes.getIds();
    for(i = 0; i < ids.length; i++) {
      if(!top.nodes || !top.nodes[ids[i]]) nodes.remove({id:ids[i]});
    }
    ids = edges.getIds();
    for(i = 0; i < ids.length; i++) {
      if(!top.links || !top.links[ids[i]]) edges.remove({id:ids[i]});
    }
  }

  function updateNetwork(data) {
    var ids,i,links,width;

    if(!data || !data.topologyMetrics) return;

    if(data.topologyMetrics.version != version) {
      updateTopology(data.topologyMetrics);
      version = data.topologyMetrics.version;
    }
    links = data.topologyMetrics.links;
    if(links) {
      ids = edges.getIds();
      for(i = 0; i < ids.length; i++) {
        width = links[ids[i]] ? links[ids[i]].width : 1;
        edges.update({id:ids[i],width:width});
      }
    } 
  }

  function updateData(data) {
    updateNetwork(data);
    if(!data 
      || !data.trend 
      || !data.trend.times 
      || data.trend.times.length == 0) return;

    if(db.trend) {
      // merge in new data
      var maxPoints = db.trend.maxPoints;
      var remove = db.trend.times.length > maxPoints ? db.trend.times.length - maxPoints : 0;
      db.trend.times = db.trend.times.concat(data.trend.times);
      if(remove) db.trend.times = db.trend.times.slice(remove);
      for(var name in db.trend.trends) {
        db.trend.trends[name] = db.trend.trends[name].concat(data.trend.trends[name]);
        if(remove) db.trend.trends[name] = db.trend.trends[name].slice(remove);
      }
    } else db.trend = data.trend;

    db.trend.start = new Date(db.trend.times[0]);
    db.trend.end = new Date(db.trend.times[db.trend.times.length - 1]);

    $.event.trigger({type:'updateChart'});
  }

  function pollTrends() {
    $.ajax({
      url: dataURL,
      data: db.trend && db.trend.end ? {after:db.trend.end.getTime()} : null,
      success: function(data) {
        updateData(data);
        setTimeout(pollTrends, 1000);
      },
      error: function(result,status,errorThrown) {
        setTimeout(pollTrends,5000);
      },
      timeout: 60000
    });
  };
	
  $(window).resize(function() {
    $.event.trigger({type:'updateChart'});
    network.fit();
  });

  nodes = new vis.DataSet([]);
  edges = new vis.DataSet([]);

  var container = $('#vis-network')[0];
  var data = {nodes:nodes, edges:edges};
  var options = {
    interaction: {zoomView:false}
  };
  network = new vis.Network(container, data, options);
  network.on('stabilized', function() {
    network.fit({animation:{duration:1000}});
  });

  pollTrends();
});
